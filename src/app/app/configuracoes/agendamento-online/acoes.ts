"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { gerarSlug, slugValido } from "@/lib/agendamento-online";
import { hojeIso } from "@/lib/datas";
import { errosPorCampo, type EstadoForm } from "@/lib/formulario";
import { exigirEscrita } from "@/lib/sessao";

const vazio = (v: unknown) => (v === "" || v === null ? undefined : v);

const esquema = z.object({
  agendamento_online: z.boolean(),
  // O que a pessoa digitar vira um endereço válido ("Barbearia do Zé" → "barbearia-do-ze").
  slug: z
    .string({ error: "Digite o endereço do link." })
    .transform((v) => gerarSlug(v))
    .refine(slugValido, { error: "Use de 3 a 60 letras, números ou traços." }),
  agendamento_dias_adiante: z.coerce.number({ error: "Valor inválido." }).int().min(1, { error: "Mínimo de 1 dia." }).max(90, { error: "Máximo de 90 dias." }),
  agendamento_antecedencia_horas: z.coerce.number({ error: "Valor inválido." }).int().min(0).max(72, { error: "Máximo de 72 horas." }),
  agendamento_mostrar_precos: z.boolean(),
  agendamento_mensagem: z.preprocess(vazio, z.string().trim().max(300, { error: "Use no máximo 300 caracteres." }).optional()),
  datas_fechadas: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Data inválida." })).max(120, { error: "Máximo de 120 datas." }),
});

/** Salva os ajustes do link público de agendamento. */
export async function salvarAgendamentoOnline(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const r = esquema.safeParse({
    agendamento_online: form.get("agendamento_online") === "on",
    slug: form.get("slug") ?? undefined,
    agendamento_dias_adiante: form.get("agendamento_dias_adiante"),
    agendamento_antecedencia_horas: form.get("agendamento_antecedencia_horas"),
    agendamento_mostrar_precos: form.get("agendamento_mostrar_precos") === "on",
    agendamento_mensagem: form.get("agendamento_mensagem"),
    datas_fechadas: form.getAll("datas_fechadas"),
  });
  if (!r.success) return { erros: errosPorCampo(r.error) };

  const { supabase, empresa, bloqueio } = await exigirEscrita();
  if (bloqueio) return { erro: bloqueio, limiteAtingido: true };
  if (r.data.agendamento_online && !empresa.agenda_ativa) {
    return { erro: "Ligue a agenda de atendimentos antes de ligar o link." };
  }

  // Datas que já passaram saem da lista; repetidas viram uma só.
  const hoje = hojeIso();
  const datas = [...new Set(r.data.datas_fechadas)].filter((d) => d >= hoje).sort();

  const { error } = await supabase
    .from("empresas")
    .update({ ...r.data, agendamento_mensagem: r.data.agendamento_mensagem ?? null, datas_fechadas: datas })
    .eq("id", empresa.id);
  if (error) {
    if (error.code === "23505") return { erros: { slug: "Esse endereço já está em uso por outra empresa. Escolha outro." } };
    console.error("[agendamento online] ajustes", error);
    return { erro: "Não foi possível salvar." };
  }
  revalidatePath("/app", "layout");
  revalidatePath(`/agendar/${r.data.slug}`);
  return { sucesso: r.data.agendamento_online ? "Link atualizado. Já pode enviar para os clientes." : "Ajustes salvos. O link está desligado." };
}
