import { z } from "zod";
import { validarCodigoInformado } from "@/lib/codigo-barras";
import { paraCentavos } from "@/lib/dinheiro";
import { paraQuantidade, UNIDADES } from "@/lib/estoque";

const vazio = (v: unknown) => (v === "" || v === null ? undefined : v);

const dinheiro = (rotulo: string) =>
  z.preprocess(
    (v) => vazio(v) ?? "0",
    z.string().transform((v, ctx) => {
      const c = paraCentavos(v);
      if (c === null || c < 0 || c > 10_000_000_000) {
        ctx.addIssue({ code: "custom", message: `${rotulo} inválido.` });
        return z.NEVER;
      }
      return c;
    }),
  );

export const quantidade = (rotulo: string) =>
  z.preprocess(
    (v) => vazio(v) ?? "0",
    z.string().transform((v, ctx) => {
      const q = paraQuantidade(v);
      if (q === null) {
        ctx.addIssue({ code: "custom", message: `${rotulo}: use números, com até 3 casas (ex.: 1,5).` });
        return z.NEVER;
      }
      return q;
    }),
  );

export const esquemaProduto = z.object({
  id: z.preprocess(vazio, z.uuid().optional()),
  nome: z.string({ error: "Digite o nome do produto." }).trim().min(1, { error: "Digite o nome do produto." }).max(120),
  unidade: z.enum(UNIDADES, { error: "Escolha a unidade." }),
  custo: dinheiro("Custo"),
  preco: dinheiro("Preço"),
  estoque: quantidade("Estoque"),
  estoque_minimo: quantidade("Estoque mínimo"),
  codigo_barras: z.preprocess(
    vazio,
    z
      .string()
      .transform((v, ctx) => {
        const r = validarCodigoInformado(v);
        if (!r.ok) {
          ctx.addIssue({ code: "custom", message: r.erro });
          return z.NEVER;
        }
        return r.codigo;
      })
      .optional(),
  ),
});

export const esquemaMovimento = z
  .object({
    produto_id: z.uuid(),
    tipo: z.enum(["entrada", "perda", "ajuste"], { error: "Escolha o tipo." }),
    quantidade: quantidade("Quantidade"),
    custo: z.preprocess(vazio, z.string().optional()).transform((v, ctx) => {
      if (v === undefined) return undefined;
      const c = paraCentavos(v);
      if (c === null || c < 0) {
        ctx.addIssue({ code: "custom", message: "Custo inválido." });
        return z.NEVER;
      }
      return c;
    }),
    lancar_saida: z.preprocess((v) => v === "on", z.boolean()),
    categoria_id: z.preprocess(vazio, z.uuid().optional()),
    forma_pagamento: z.preprocess(vazio, z.string().max(20).optional()),
    observacao: z.preprocess(vazio, z.string().trim().max(200).optional()),
  })
  .superRefine((d, ctx) => {
    if (d.tipo !== "ajuste" && d.quantidade <= 0) {
      ctx.addIssue({ code: "custom", path: ["quantidade"], message: "Digite uma quantidade maior que zero." });
    }
  });
