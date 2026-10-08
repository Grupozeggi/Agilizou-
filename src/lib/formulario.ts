import type { z } from "zod";

/** Estado devolvido pelas Server Actions de formulário. */
export type EstadoForm = {
  erro?: string;
  sucesso?: string;
  erros?: Record<string, string>;
  valores?: Record<string, string>;
};

/** Primeira mensagem de erro de cada campo. */
export function errosPorCampo(erro: z.ZodError): Record<string, string> {
  const r: Record<string, string> = {};
  for (const issue of erro.issues) {
    const campo = String(issue.path[0] ?? "form");
    r[campo] ??= issue.message;
  }
  return r;
}
