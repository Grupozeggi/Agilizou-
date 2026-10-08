import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Tarefas agendadas (Vercel Cron) mandam "Authorization: Bearer <CRON_SECRET>".
 * Sem o segredo configurado, nenhuma chamada é aceita.
 */
export function cronAutorizado(request: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  const recebido = Buffer.from(request.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}
