"use server";

import { revalidatePath } from "next/cache";
import { errosPorCampo, type EstadoForm } from "@/lib/formulario";
import { exigirEscrita } from "@/lib/sessao";
import { esquemaNovaCategoria, esquemaRemover, esquemaRenomear, TIPOS_CATEGORIA } from "./validacao";

const CAMINHO = "/app/configuracoes/categorias";
const NOME_REPETIDO = "Já existe uma categoria com esse nome.";

// Todas as operações usam o cliente do usuário: a RLS garante que só a
// própria empresa é afetada, mesmo que alguém forje o id no formulário.

export async function criarCategoria(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const r = esquemaNovaCategoria.safeParse({ nome: form.get("nome"), classe: form.get("classe") });
  if (!r.success) return { erros: errosPorCampo(r.error) };

  const { supabase, bloqueio } = await exigirEscrita();
  if (bloqueio) return { erro: bloqueio, limiteAtingido: true };
  const { error } = await supabase.from("categorias").insert({ nome: r.data.nome, ...TIPOS_CATEGORIA[r.data.classe] });
  if (error) {
    if (error.code === "23505") return { erros: { nome: NOME_REPETIDO } };
    console.error("[categorias] criar", error);
    return { erro: "Não foi possível salvar. Tente de novo." };
  }
  revalidatePath(CAMINHO);
  return { sucesso: "Categoria criada." };
}

export async function renomearCategoria(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const r = esquemaRenomear.safeParse({ id: form.get("id"), nome: form.get("nome") });
  if (!r.success) return { erros: errosPorCampo(r.error) };

  const { supabase, bloqueio } = await exigirEscrita();
  if (bloqueio) return { erro: bloqueio, limiteAtingido: true };
  const { error, count } = await supabase
    .from("categorias")
    .update({ nome: r.data.nome }, { count: "exact" })
    .eq("id", r.data.id)
    .is("deleted_at", null);
  if (error) {
    if (error.code === "23505") return { erros: { nome: NOME_REPETIDO } };
    console.error("[categorias] renomear", error);
    return { erro: "Não foi possível salvar. Tente de novo." };
  }
  if (!count) return { erro: "Categoria não encontrada." };
  revalidatePath(CAMINHO);
  return { sucesso: "Salvo." };
}

/** Exclusão lógica: os lançamentos antigos continuam mostrando a categoria. */
export async function removerCategoria(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const r = esquemaRemover.safeParse({ id: form.get("id") });
  if (!r.success) return { erro: "Categoria inválida." };

  const { supabase, bloqueio } = await exigirEscrita();
  if (bloqueio) return { erro: bloqueio, limiteAtingido: true };
  const { error, count } = await supabase
    .from("categorias")
    .update({ deleted_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", r.data.id)
    .is("deleted_at", null);
  if (error || !count) {
    if (error) console.error("[categorias] remover", error);
    return { erro: "Não foi possível remover. Tente de novo." };
  }
  revalidatePath(CAMINHO);
  return {};
}
