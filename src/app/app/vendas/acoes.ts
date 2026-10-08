"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { EstadoForm } from "@/lib/formulario";
import { hojeIso } from "@/lib/datas";
import { FORMAS_PAGAMENTO } from "@/lib/lancamentos";
import { exigirEscrita } from "@/lib/sessao";

const item = z
  .object({
    produto_id: z.uuid().nullable().optional(),
    servico_id: z.uuid().nullable().optional(),
    descricao: z.string().trim().max(140).nullable().optional(),
    quantidade: z.number().positive().max(1_000_000),
    preco_unitario_centavos: z.number().int().min(0).max(10_000_000_000),
  })
  .refine((i) => i.produto_id || i.servico_id || i.descricao, { error: "Item sem descrição." });

const esquemaVenda = z.object({
  itens: z.array(item).min(1, { error: "Adicione pelo menos um item." }).max(200),
  desconto_centavos: z.number().int().min(0),
  forma_pagamento: z.enum(Object.keys(FORMAS_PAGAMENTO) as [keyof typeof FORMAS_PAGAMENTO]),
  categoria_id: z.uuid().nullable(),
  cliente_id: z.uuid().nullable(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  observacao: z.string().trim().max(500).nullable(),
  agendamento_id: z.uuid().nullable().optional(),
});

const ERROS_BANCO: [RegExp, string][] = [
  [/Desconto maior/, "O desconto é maior que o valor da venda."],
  [/Produto não encontrado/, "Um dos produtos foi excluído. Atualize a página."],
  [/Serviço não encontrado/, "Um dos serviços foi excluído. Atualize a página."],
  [/não combina/, "Escolha uma categoria de entrada."],
];

export async function registrarVenda(json: string): Promise<EstadoForm> {
  let bruto: unknown;
  try {
    bruto = JSON.parse(json);
  } catch {
    return { erro: "Dados da venda inválidos." };
  }
  const r = esquemaVenda.safeParse(bruto);
  if (!r.success) return { erro: r.error.issues[0]?.message ?? "Confira os itens da venda." };
  if (r.data.data > hojeIso()) return { erro: "A data da venda não pode ser no futuro." };

  const { supabase, bloqueio } = await exigirEscrita();
  if (bloqueio) return { erro: bloqueio, limiteAtingido: true };
  const { agendamento_id, ...venda } = r.data;
  const { data: id, error } = await supabase.rpc("registrar_venda", { p_venda: venda });
  if (error) {
    console.error("[vendas]", error);
    const conhecido = ERROS_BANCO.find(([re]) => re.test(error.message));
    return { erro: conhecido?.[1] ?? "Não foi possível registrar a venda. Tente de novo." };
  }
  // Liga a venda ao atendimento que a originou.
  if (agendamento_id) {
    await supabase.from("agendamentos").update({ venda_id: id }).eq("id", agendamento_id).is("venda_id", null);
  }
  revalidatePath("/app", "layout");
  redirect(`/app/vendas/${id}?nova=1`);
}

export async function cancelarVenda(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const id = String(form.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) return { erro: "Venda inválida." };
  const { supabase, bloqueio } = await exigirEscrita();
  if (bloqueio) return { erro: bloqueio, limiteAtingido: true };
  const { error } = await supabase.rpc("cancelar_venda", { p_venda: id });
  if (error) {
    console.error("[vendas] cancelar", error);
    return { erro: "Não foi possível cancelar a venda." };
  }
  revalidatePath("/app", "layout");
  redirect("/app/vendas");
}
