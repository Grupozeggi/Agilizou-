"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { paraCentavos } from "@/lib/dinheiro";
import { errosPorCampo, type EstadoForm } from "@/lib/formulario";
import { exigirEscrita } from "@/lib/sessao";
import { dadosDoForm } from "../lancamentos/validacao";

const vazio = (v: unknown) => (v === "" || v === null ? undefined : v);

const esquema = z.object({
  titulo: z.string({ error: "Escreva o lembrete." }).trim().min(1, { error: "Escreva o lembrete." }).max(140),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Escolha a data." }),
  tipo: z.enum(["pagar", "cobrar", "outro"]),
  valor: z.preprocess(
    vazio,
    z
      .string()
      .transform((v, ctx) => {
        const c = paraCentavos(v);
        if (c === null || c < 0) {
          ctx.addIssue({ code: "custom", message: "Valor inválido." });
          return z.NEVER;
        }
        return c === 0 ? null : c;
      })
      .optional(),
  ),
  cliente_id: z.preprocess(vazio, z.uuid().optional()),
  observacao: z.preprocess(vazio, z.string().trim().max(500).optional()),
});

function revalidar() {
  revalidatePath("/app", "layout");
}

export async function criarLembrete(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const r = esquema.safeParse(dadosDoForm(form));
  if (!r.success) return { erros: errosPorCampo(r.error) };
  const d = r.data;
  const { supabase, bloqueio } = await exigirEscrita();
  if (bloqueio) return { erro: bloqueio, limiteAtingido: true };
  const { error } = await supabase.from("lembretes").insert({
    titulo: d.titulo,
    data: d.data,
    tipo: d.tipo,
    valor_centavos: d.valor ?? null,
    cliente_id: d.cliente_id ?? null,
    observacao: d.observacao ?? null,
  });
  if (error) {
    console.error("[lembretes]", error);
    return { erro: "Não foi possível salvar o lembrete." };
  }
  revalidar();
  return { sucesso: "Lembrete criado." };
}

/** Um toque: marca ou desmarca como feito. */
export async function marcarLembrete(id: string, feito: boolean): Promise<EstadoForm> {
  if (!z.uuid().safeParse(id).success) return { erro: "Lembrete inválido." };
  const { supabase, bloqueio } = await exigirEscrita();
  if (bloqueio) return { erro: bloqueio, limiteAtingido: true };
  const { error } = await supabase
    .from("lembretes")
    .update({ feito, feito_em: feito ? new Date().toISOString() : null })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { erro: "Não foi possível atualizar." };
  revalidar();
  return { sucesso: "ok" };
}

export async function excluirLembrete(id: string): Promise<EstadoForm> {
  if (!z.uuid().safeParse(id).success) return { erro: "Lembrete inválido." };
  const { supabase, bloqueio } = await exigirEscrita();
  if (bloqueio) return { erro: bloqueio, limiteAtingido: true };
  const { error } = await supabase.from("lembretes").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { erro: "Não foi possível excluir." };
  revalidar();
  return { sucesso: "ok" };
}
