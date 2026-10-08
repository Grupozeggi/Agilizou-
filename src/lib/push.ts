import "server-only";
import webpush from "web-push";

export type Inscricao = { endpoint: string; p256dh: string; auth: string };

let configurado: boolean | null = null;
function configurar() {
  if (configurado !== null) return configurado;
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  configurado = Boolean(publica && privada);
  if (configurado) webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:suporte@agilizou.app", publica!, privada!);
  return configurado;
}

/**
 * Manda uma notificação para um aparelho. Retorna "expirada" quando o
 * aparelho cancelou a inscrição (a gente apaga do banco).
 */
export async function enviarPush(i: Inscricao, dados: { titulo: string; corpo: string; url: string }) {
  if (!configurar()) {
    console.info(`[push simulado] ${dados.titulo}: ${dados.corpo}`);
    return "simulado" as const;
  }
  try {
    await webpush.sendNotification(
      { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
      JSON.stringify({ title: dados.titulo, body: dados.corpo, url: dados.url }),
      { TTL: 60 * 60 * 12 },
    );
    return "enviada" as const;
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "expirada" as const;
    console.error("[push]", e);
    return "erro" as const;
  }
}
