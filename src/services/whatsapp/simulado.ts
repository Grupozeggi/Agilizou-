import { randomUUID } from "node:crypto";
import type { ProvedorWhatsapp } from "./tipos";

/** Não envia nada: só registra no log. Usado em desenvolvimento e testes. */
export const provedorSimulado: ProvedorWhatsapp = {
  nome: "simulado",
  async enviarLembrete(telefone, texto) {
    console.info(`[whatsapp simulado] lembrete para ${telefone}: ${texto}`);
    return { ok: true, id: `sim-${randomUUID()}` };
  },
  async enviarTexto(telefone, texto) {
    console.info(`[whatsapp simulado] texto para ${telefone}: ${texto}`);
    return { ok: true, id: `sim-${randomUUID()}` };
  },
};
