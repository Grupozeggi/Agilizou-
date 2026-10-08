"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { errosPorCampo, type EstadoForm } from "@/lib/formulario";
import { usoCadastro } from "@/lib/limites";
import { exigirEscrita } from "@/lib/sessao";
import { dadosDoForm } from "../lancamentos/validacao";
import { esquemaMovimento, esquemaProduto } from "./validacao";

export async function salvarProduto(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const r = esquemaProduto.safeParse(dadosDoForm(form));
  if (!r.success) return { erros: errosPorCampo(r.error) };
  const d = r.data;
  const { supabase, empresa, bloqueio } = await exigirEscrita();
  if (bloqueio) return { erro: bloqueio, limiteAtingido: true };

  const dados = {
    nome: d.nome,
    unidade: d.unidade,
    custo_centavos: d.custo,
    preco_centavos: d.preco,
    estoque_minimo: d.estoque_minimo,
    // vazio = o banco gera o código interno
    codigo_barras: d.codigo_barras ?? null,
  };

  let id = d.id;
  if (id) {
    const { error, count } = await supabase
      .from("produtos")
      .update(dados, { count: "exact" })
      .eq("id", id)
      .is("deleted_at", null);
    if (error) return erroProduto(error);
    if (!count) return { erro: "Produto não encontrado." };
  } else {
    const uso = await usoCadastro(supabase, empresa, "produtos");
    if (uso.situacao === "bloqueado") return { erro: uso.mensagem, limiteAtingido: true };
    // O estoque inicial vira a primeira movimentação (gatilho no banco).
    const { data, error } = await supabase.from("produtos").insert({ ...dados, estoque: d.estoque }).select("id").single();
    if (error) return erroProduto(error);
    id = data.id;
  }

  revalidatePath("/app/produtos");
  redirect(`/app/produtos/${id}`);
}

function erroProduto(error: { code?: string; message?: string }): EstadoForm {
  if (error.code === "23505") return { erros: { codigo_barras: "Outro produto já usa este código de barras." } };
  console.error("[produtos]", error);
  return { erro: "Não foi possível salvar o produto. Tente de novo." };
}

export async function excluirProduto(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const id = String(form.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) return { erro: "Produto inválido." };
  const { supabase, bloqueio } = await exigirEscrita();
  if (bloqueio) return { erro: bloqueio, limiteAtingido: true };
  const { error, count } = await supabase
    .from("produtos")
    .update({ deleted_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", id)
    .is("deleted_at", null);
  if (error || !count) return { erro: "Não foi possível excluir o produto." };
  revalidatePath("/app/produtos");
  redirect("/app/produtos");
}

export async function movimentarEstoque(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const r = esquemaMovimento.safeParse(dadosDoForm(form));
  if (!r.success) return { erros: errosPorCampo(r.error) };
  const d = r.data;
  const { supabase, bloqueio } = await exigirEscrita();
  if (bloqueio) return { erro: bloqueio, limiteAtingido: true };

  const { error } = await supabase.rpc("movimentar_estoque", {
    p_produto: d.produto_id,
    p_tipo: d.tipo,
    p_quantidade: d.quantidade,
    p_custo_unitario_centavos: d.custo ?? null,
    p_lancar_saida: d.tipo === "entrada" && d.lancar_saida,
    p_categoria: d.categoria_id ?? null,
    p_forma_pagamento: d.forma_pagamento ?? null,
    p_observacao: d.observacao ?? null,
  });
  if (error) {
    console.error("[estoque]", error);
    if (error.message.includes("não combina")) return { erros: { categoria_id: "Escolha uma categoria de saída." } };
    return { erro: "Não foi possível registrar a movimentação." };
  }
  revalidatePath("/app/produtos", "layout");
  revalidatePath("/app", "layout");
  return { sucesso: "Estoque atualizado." };
}
