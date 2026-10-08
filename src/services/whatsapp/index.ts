import "server-only";
import { provedorMeta } from "./meta";
import { provedorSimulado } from "./simulado";
import type { ProvedorWhatsapp } from "./tipos";

export type { ProvedorWhatsapp, ResultadoEnvio } from "./tipos";

/**
 * Escolhe o provedor. WHATSAPP_PROVEDOR=meta liga a API real; qualquer outro
 * valor (ou sem token) usa o modo simulado, que só registra no log.
 */
export function provedorWhatsapp(): ProvedorWhatsapp {
  if (process.env.WHATSAPP_PROVEDOR === "meta" && process.env.WHATSAPP_TOKEN) return provedorMeta;
  return provedorSimulado;
}

/** Custo estimado por mensagem enviada, em centavos (para o painel). */
export function custoEstimadoCentavos(): number {
  const v = Number(process.env.WHATSAPP_CUSTO_CENTAVOS ?? "5");
  return Number.isFinite(v) && v >= 0 ? Math.round(v) : 5;
}
