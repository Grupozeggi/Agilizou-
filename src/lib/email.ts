import "server-only";

type Email = { para: string[]; assunto: string; html: string; texto: string };

/**
 * Envia e-mail pela API do Resend (sem SDK). Sem RESEND_API_KEY, só registra
 * no log (modo simulado), para desenvolver sem mandar e-mail de verdade.
 */
export async function enviarEmail(e: Email): Promise<{ ok: boolean; simulado?: boolean; erro?: string }> {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) {
    console.info(`[e-mail simulado] para=${e.para.join(",")} assunto="${e.assunto}"\n${e.texto}`);
    return { ok: true, simulado: true };
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_REMETENTE ?? "Agilizou <avisos@agilizou.app>",
      to: e.para,
      subject: e.assunto,
      html: e.html,
      text: e.texto,
    }),
  });
  if (!r.ok) return { ok: false, erro: `Resend ${r.status}: ${await r.text()}` };
  return { ok: true };
}
