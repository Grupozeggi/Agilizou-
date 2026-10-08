"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { EstadoForm } from "@/lib/formulario";
import { usoCadastro } from "@/lib/limites";
import { exigirEscrita } from "@/lib/sessao";

export async function salvarProfissional(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const id = String(form.get("id") ?? "");
  const nome = String(form.get("nome") ?? "").trim();
  if (!nome || nome.length > 120) return { erros: { nome: "Digite o nome." } };
  const { supabase, empresa, bloqueio } = await exigirEscrita();
  if (bloqueio) return { erro: bloqueio, limiteAtingido: true };
  if (id) {
    if (!z.uuid().safeParse(id).success) return { erro: "Profissional inválido." };
    const { error } = await supabase.from("profissionais").update({ nome }).eq("id", id);
    if (error) return { erro: "Não foi possível salvar." };
  } else {
    const uso = await usoCadastro(supabase, empresa, "profissionais");
    if (uso.situacao === "bloqueado") return { erro: uso.mensagem, limiteAtingido: true };
    const { error } = await supabase.from("profissionais").insert({ nome });
    if (error) return { erro: "Não foi possível salvar." };
  }
  revalidatePath("/app", "layout");
  return { sucesso: "Salvo." };
}

/** Remove da agenda (exclusão lógica). Atendimentos antigos ficam no histórico. */
export async function removerProfissional(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const id = String(form.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) return { erro: "Profissional inválido." };
  const { supabase, bloqueio } = await exigirEscrita();
  if (bloqueio) return { erro: bloqueio, limiteAtingido: true };
  const { error } = await supabase.from("profissionais").update({ deleted_at: new Date().toISOString(), ativo: false }).eq("id", id);
  if (error) return { erro: "Não foi possível remover." };
  revalidatePath("/app", "layout");
  return {};
}
