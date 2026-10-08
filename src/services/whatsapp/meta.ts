import { limparParametro } from "@/lib/regua";
import type { ProvedorWhatsapp, ResultadoEnvio } from "./tipos";

/**
 * WhatsApp Business Cloud API (Meta).
 *
 * Mensagens iniciadas pela empresa precisam de template aprovado. O Agilizou
 * usa um template único (WHATSAPP_TEMPLATE, padrão "agilizou_lembrete"),
 * categoria Utilidade, idioma pt_BR, com corpo:
 *   "Mensagem da sua agenda: {{1}}"
 * e botões de resposta rápida "1 - Confirmar", "2 - Remarcar", "3 - Cancelar".
 * O texto editável da régua vai no parâmetro {{1}}.
 */
const VERSAO = "v21.0";

async function enviar(corpo: object): Promise<ResultadoEnvio> {
  const token = process.env.WHATSAPP_TOKEN;
  const telefoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !telefoneId) return { ok: false, erro: "WhatsApp não configurado.", definitivo: true };
  try {
    const r = await fetch(`https://graph.facebook.com/${VERSAO}/${telefoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...corpo }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await r.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
    if (r.ok && json.messages?.[0]?.id) return { ok: true, id: json.messages[0].id };
    // 4xx de número inválido/sem WhatsApp não adianta repetir; 429/5xx sim.
    const definitivo = r.status >= 400 && r.status < 500 && r.status !== 429;
    return { ok: false, erro: json.error?.message ?? `HTTP ${r.status}`, definitivo };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "falha de rede", definitivo: false };
  }
}

export const provedorMeta: ProvedorWhatsapp = {
  nome: "meta",
  enviarLembrete(telefone, texto) {
    return enviar({
      to: telefone,
      type: "template",
      template: {
        name: process.env.WHATSAPP_TEMPLATE ?? "agilizou_lembrete",
        language: { code: "pt_BR" },
        components: [{ type: "body", parameters: [{ type: "text", text: limparParametro(texto) }] }],
      },
    });
  },
  enviarTexto(telefone, texto) {
    return enviar({ to: telefone, type: "text", text: { body: texto.slice(0, 4096) } });
  },
};
