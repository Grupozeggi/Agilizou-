import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { hojeIso } from "@/lib/datas";
import { interpretarResposta } from "@/lib/regua";
import { lerWebhook, variantesTelefone } from "@/lib/whatsapp-fila";
import { criarClienteServico } from "@/lib/supabase/servico";
import { provedorWhatsapp } from "@/services/whatsapp";

/** Verificação do webhook pela Meta (feita uma vez, ao cadastrar a URL). */
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === token) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Proibido", { status: 403 });
}

function assinaturaValida(corpo: string, assinatura: string | null): boolean {
  const segredo = process.env.WHATSAPP_APP_SECRET;
  if (!segredo || !assinatura?.startsWith("sha256=")) return false;
  const esperado = Buffer.from(`sha256=${createHmac("sha256", segredo).update(corpo).digest("hex")}`);
  const recebido = Buffer.from(assinatura);
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

const RESPOSTAS = {
  confirmar: "Obrigado, {nome}! Seu horário está confirmado. Até lá!",
  cancelar: "Tudo bem, {nome}. Cancelamos seu horário. Quando quiser marcar de novo, é só chamar.",
  remarcar: "Combinado, {nome}! A {empresa} vai falar com você para escolher um novo horário.",
};

/**
 * Status das mensagens (entregue, lida, falhou) e respostas dos clientes.
 * Só aceita chamadas assinadas pela Meta (X-Hub-Signature-256).
 */
export async function POST(request: Request) {
  const corpo = await request.text();
  if (!assinaturaValida(corpo, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ erro: "Assinatura inválida." }, { status: 401 });
  }
  let json: unknown;
  try {
    json = JSON.parse(corpo);
  } catch {
    return NextResponse.json({ erro: "JSON inválido." }, { status: 400 });
  }
  const db = criarClienteServico();
  const { statuses, respostas } = lerWebhook(json);

  for (const s of statuses) {
    // Só avança o status (enviada → entregue → lida); falhou sempre vale.
    const ordem = ["enviada", "entregue", "lida"];
    const antes = s.status === "falhou" ? ordem : ordem.slice(0, ordem.indexOf(s.status));
    await db
      .from("mensagens_whatsapp")
      .update({ status: s.status, ...(s.erro ? { erro: s.erro } : {}) })
      .eq("provedor_mensagem_id", s.id)
      .in("status", antes);
  }

  for (const r of respostas) {
    const acao = interpretarResposta(r.texto);
    if (!acao) continue;
    // Última mensagem enviada para este número com agendamento ainda aberto.
    const { data: msgs } = await db
      .from("mensagens_whatsapp")
      .select("agendamento_id, empresa_id, agendamento:agendamentos(id, status, inicio, cliente:clientes(nome)), empresa:empresas(nome)")
      .in("telefone", variantesTelefone(r.de))
      .in("status", ["enviada", "entregue", "lida"])
      .order("enviado_em", { ascending: false })
      .limit(10);
    type Linha = {
      agendamento_id: string;
      empresa_id: string;
      agendamento: { id: string; status: string; inicio: string; cliente: { nome: string } | null } | null;
      empresa: { nome: string } | null;
    };
    const alvo = ((msgs ?? []) as unknown as Linha[]).find(
      (m) => m.agendamento && ["agendado", "confirmado"].includes(m.agendamento.status) && m.agendamento.inicio > new Date().toISOString(),
    );
    if (!alvo?.agendamento) continue;

    const novoStatus = { confirmar: "confirmado", cancelar: "cancelado", remarcar: "remarcado" }[acao];
    await db.from("agendamentos").update({ status: novoStatus }).eq("id", alvo.agendamento.id);
    await db.rpc("cancelar_mensagens_agendamento", { p_agendamento: alvo.agendamento.id, p_so_confirmacoes: acao === "confirmar" });
    const nome = alvo.agendamento.cliente?.nome.split(" ")[0] ?? "";
    if (acao === "remarcar") {
      // Lembrete para o dono ligar e escolher o novo horário.
      await db.from("lembretes").insert({
        empresa_id: alvo.empresa_id,
        titulo: `Remarcar com ${alvo.agendamento.cliente?.nome ?? "cliente"} (pediu pelo WhatsApp)`,
        data: hojeIso(),
        tipo: "outro",
      });
    }
    await provedorWhatsapp().enviarTexto(r.de, RESPOSTAS[acao].replace("{nome}", nome).replace("{empresa}", alvo.empresa?.nome ?? "empresa"));
  }
  return NextResponse.json({ ok: true });
}
