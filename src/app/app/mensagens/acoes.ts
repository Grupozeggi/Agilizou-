"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { EstadoForm } from "@/lib/formulario";
import { REGUA_PADRAO } from "@/lib/regua";
import { exigirEscrita } from "@/lib/sessao";

export async function salvarRegua(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const regua = REGUA_PADRAO.map((p) => ({
    etapa: p.etapa,
    dias_antes: p.dias_antes,
    ativo: form.get(`ativo_${p.etapa}`) === "on",
    modelo: String(form.get(`modelo_${p.etapa}`) ?? "").trim(),
  }));
  const r = z
    .array(z.object({ modelo: z.string().min(5, { error: "Mensagem muito curta." }).max(700, { error: "Use no máximo 700 caracteres." }) }))
    .safeParse(regua);
  if (!r.success) {
    const i = Number(r.error.issues[0].path[0]);
    return { erros: { [`modelo_${regua[i].etapa}`]: r.error.issues[0].message } };
  }
  const { supabase, empresa, bloqueio } = await exigirEscrita();
  if (bloqueio) return { erro: bloqueio, limiteAtingido: true };
  const { error } = await supabase
    .from("empresas")
    .update({ whatsapp_ativo: form.get("whatsapp_ativo") === "on", regua_whatsapp: regua })
    .eq("id", empresa.id);
  if (error) return { erro: "Não foi possível salvar." };
  revalidatePath("/app/mensagens");
  return { sucesso: "Mensagens salvas. Valem para os próximos agendamentos." };
}
