"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { EstadoForm } from "@/lib/formulario";
import { exigirEscrita } from "@/lib/sessao";

const esquema = z.object({
  aviso_email: z.boolean(),
  aviso_push: z.boolean(),
  aviso_no_dia: z.boolean(),
  aviso_dias_antes: z.coerce.number().int().min(0).max(7),
});

export async function salvarAvisos(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const r = esquema.safeParse({
    aviso_email: form.get("aviso_email") === "on",
    aviso_push: form.get("aviso_push") === "on",
    aviso_no_dia: form.get("aviso_no_dia") === "on",
    aviso_dias_antes: form.get("aviso_dias_antes"),
  });
  if (!r.success) return { erro: "Confira as opções." };
  const { supabase, empresa, bloqueio } = await exigirEscrita();
  if (bloqueio) return { erro: bloqueio, limiteAtingido: true };
  const { error } = await supabase.from("empresas").update(r.data).eq("id", empresa.id);
  if (error) return { erro: "Não foi possível salvar." };
  revalidatePath("/app/configuracoes/avisos");
  return { sucesso: "Avisos salvos." };
}

const inscricao = z.object({
  endpoint: z.url().startsWith("https://").max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(10).max(100) }),
});

/** Guarda a inscrição de notificação deste aparelho. */
export async function salvarInscricaoPush(json: string): Promise<EstadoForm> {
  let bruto: unknown;
  try {
    bruto = JSON.parse(json);
  } catch {
    return { erro: "Inscrição inválida." };
  }
  const r = inscricao.safeParse(bruto);
  if (!r.success) return { erro: "Inscrição inválida." };
  const { supabase, bloqueio } = await exigirEscrita();
  if (bloqueio) return { erro: bloqueio, limiteAtingido: true };
  // Mesmo aparelho de novo: substitui.
  await supabase.from("notificacoes_push").delete().eq("endpoint", r.data.endpoint);
  const { error } = await supabase
    .from("notificacoes_push")
    .insert({ endpoint: r.data.endpoint, p256dh: r.data.keys.p256dh, auth: r.data.keys.auth });
  if (error) {
    console.error("[push] inscrição", error);
    return { erro: "Não foi possível ativar as notificações." };
  }
  return { sucesso: "Notificações ativadas neste aparelho." };
}
