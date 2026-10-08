import { z } from "zod";

/** "entrada" | "custo" | "despesa": o tipo e o grupo saem juntos desta escolha. */
export const TIPOS_CATEGORIA = {
  entrada: { tipo: "entrada", grupo: "receita" },
  custo: { tipo: "saida", grupo: "custo" },
  despesa: { tipo: "saida", grupo: "despesa" },
} as const;

const nome = z
  .string({ error: "Digite o nome da categoria." })
  .trim()
  .min(1, { error: "Digite o nome da categoria." })
  .max(60, { error: "Use no máximo 60 caracteres." });

export const esquemaNovaCategoria = z.object({
  nome,
  classe: z.enum(["entrada", "custo", "despesa"], { error: "Escolha se é entrada, custo ou despesa." }),
});

export const esquemaRenomear = z.object({
  id: z.uuid({ error: "Categoria inválida." }),
  nome,
});

export const esquemaRemover = z.object({ id: z.uuid({ error: "Categoria inválida." }) });
