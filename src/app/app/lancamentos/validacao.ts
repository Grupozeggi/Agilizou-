import { z } from "zod";
import { paraIso } from "@/lib/datas";
import { paraCentavos } from "@/lib/dinheiro";
import { FORMAS_PAGAMENTO } from "@/lib/lancamentos";

/** Limite de sanidade por lançamento: R$ 100 milhões. */
const VALOR_MAXIMO = 10_000_000_000;

const vazioParaUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);

/** Aceita aaaa-mm-dd (input date) ou dd/mm/aaaa (digitado). */
const data = z
  .string({ error: "Escolha a data." })
  .transform((v, ctx) => {
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : paraIso(v);
    if (!iso || Number.isNaN(Date.parse(iso)) || paraIso(iso.split("-").reverse().join("/")) !== iso) {
      ctx.addIssue({ code: "custom", message: "Data inválida." });
      return z.NEVER;
    }
    if (iso < "2000-01-01" || iso > "2100-12-31") {
      ctx.addIssue({ code: "custom", message: "Data fora do intervalo permitido." });
      return z.NEVER;
    }
    return iso;
  });

const valor = z.string({ error: "Digite o valor." }).transform((v, ctx) => {
  const centavos = paraCentavos(v);
  if (centavos === null || centavos <= 0) {
    ctx.addIssue({ code: "custom", message: "Digite um valor maior que zero." });
    return z.NEVER;
  }
  if (centavos > VALOR_MAXIMO) {
    ctx.addIssue({ code: "custom", message: "Valor alto demais. Confira o número." });
    return z.NEVER;
  }
  return centavos;
});

const camposComuns = {
  valor,
  categoria_id: z.uuid({ error: "Escolha uma categoria." }),
  data,
  pago: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  forma_pagamento: z.preprocess(
    vazioParaUndefined,
    z.enum(Object.keys(FORMAS_PAGAMENTO) as [keyof typeof FORMAS_PAGAMENTO], { error: "Forma de pagamento inválida." }).optional(),
  ),
  descricao: z.preprocess(vazioParaUndefined, z.string().trim().max(140, { error: "Use no máximo 140 caracteres." }).optional()),
  observacao: z.preprocess(vazioParaUndefined, z.string().trim().max(500, { error: "Use no máximo 500 caracteres." }).optional()),
};

export const esquemaNovoLancamento = z
  .object({
    tipo: z.enum(["entrada", "saida"], { error: "Escolha entrada ou saída." }),
    ...camposComuns,
    repeticao: z.preprocess(vazioParaUndefined, z.enum(["nao", "recorrente", "parcelado"]).default("nao")),
    vezes: z.preprocess(
      vazioParaUndefined,
      z.coerce.number({ error: "Digite quantas vezes." }).int({ error: "Use um número inteiro." }).optional(),
    ),
  })
  .superRefine((d, ctx) => {
    if (d.repeticao === "nao") return;
    const max = d.repeticao === "parcelado" ? 48 : 60;
    if (d.vezes === undefined || d.vezes < 2 || d.vezes > max) {
      ctx.addIssue({ code: "custom", path: ["vezes"], message: `Escolha de 2 a ${max} vezes.` });
    } else if (d.repeticao === "parcelado" && d.valor < d.vezes) {
      ctx.addIssue({ code: "custom", path: ["valor"], message: "Valor pequeno demais para dividir em tantas parcelas." });
    }
  });

export const esquemaEditarLancamento = z.object({
  id: z.uuid({ error: "Lançamento inválido." }),
  escopo: z.preprocess(vazioParaUndefined, z.enum(["este", "proximos"]).default("este")),
  ...camposComuns,
});

export const esquemaId = z.object({ id: z.uuid({ error: "Lançamento inválido." }) });
export const esquemaExcluir = z.object({
  id: z.uuid({ error: "Lançamento inválido." }),
  escopo: z.preprocess(vazioParaUndefined, z.enum(["este", "proximos"]).default("este")),
});

/** Lê um FormData como objeto simples (só strings). */
export function dadosDoForm(form: FormData): Record<string, string> {
  const r: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") r[k] = v;
  return r;
}
