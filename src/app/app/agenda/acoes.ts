"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { instanteSp } from "@/lib/agenda";
import { errosPorCampo, type EstadoForm } from "@/lib/formulario";
import { exigirCliente } from "@/lib/sessao";
import { dadosDoForm } from "../lancamentos/validacao";
import { planejarMensagens } from "../mensagens/fila";

const vazio = (v: unknown) => (v === "" || v === null ? undefined : v);
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Escolha o horário." });
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Escolha o dia." });

const esquema = z.object({
  cliente_id: z.uuid({ error: "Escolha o cliente." }),
  profissional_id: z.uuid({ error: "Escolha o profissional." }),
  servico_id: z.preprocess(vazio, z.uuid().optional()),
  data,
  hora,
  duracao: z.coerce.number({ error: "Duração inválida." }).int().min(5).max(720),
  observacao: z.preprocess(vazio, z.string().trim().max(500).optional()),
});

const CONFLITO = "Esse horário já está ocupado para este profissional. Escolha outro.";

function revalidar() {
  revalidatePath("/app", "layout");
}

export async function agendar(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const r = esquema.safeParse(dadosDoForm(form));
  if (!r.success) return { erros: errosPorCampo(r.error) };
  const d = r.data;
  const inicio = new Date(instanteSp(d.data, d.hora));
  const fim = new Date(inicio.getTime() + d.duracao * 60_000);
  const { supabase } = await exigirCliente();

  const { data: criado, error } = await supabase
    .from("agendamentos")
    .insert({
      cliente_id: d.cliente_id,
      profissional_id: d.profissional_id,
      servico_id: d.servico_id ?? null,
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      observacao: d.observacao ?? null,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23P01") return { erro: CONFLITO };
    console.error("[agenda]", error);
    return { erro: "Não foi possível agendar. Tente de novo." };
  }
  await planejarMensagens(supabase, criado.id);
  revalidar();
  redirect(`/app/agenda?dia=${d.data}&novo=1`);
}

const STATUS = ["agendado", "confirmado", "compareceu", "faltou", "cancelado"] as const;

/** Um toque: confirmar, compareceu, faltou ou cancelar. */
export async function mudarStatus(id: string, status: (typeof STATUS)[number]): Promise<EstadoForm> {
  if (!z.uuid().safeParse(id).success || !STATUS.includes(status)) return { erro: "Ação inválida." };
  const { supabase } = await exigirCliente();
  const presenca = status === "compareceu" || status === "faltou";
  const { error } = await supabase
    .from("agendamentos")
    .update({ status, presenca_em: presenca ? new Date().toISOString() : null })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) {
    // voltar um cancelado para agendado pode bater com outro horário
    if (error.code === "23P01") return { erro: CONFLITO };
    return { erro: "Não foi possível atualizar." };
  }
  // Cancelado ou atendido: mensagens pendentes deixam de ser enviadas.
  if (status !== "agendado" && status !== "confirmado") {
    await supabase.rpc("cancelar_mensagens_agendamento", { p_agendamento: id });
  }
  revalidar();
  return { sucesso: status };
}

const esquemaRemarcar = z.object({ id: z.uuid(), data, hora });

/** Remarca: o horário antigo fica como "remarcado" e nasce um novo. */
export async function remarcar(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const r = esquemaRemarcar.safeParse(dadosDoForm(form));
  if (!r.success) return { erros: errosPorCampo(r.error) };
  const { supabase } = await exigirCliente();
  const { data: antigo } = await supabase
    .from("agendamentos")
    .select("id, cliente_id, profissional_id, servico_id, inicio, fim, observacao")
    .eq("id", r.data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!antigo) return { erro: "Agendamento não encontrado." };

  const duracao = new Date(antigo.fim).getTime() - new Date(antigo.inicio).getTime();
  const inicio = new Date(instanteSp(r.data.data, r.data.hora));
  // Libera o horário antigo antes de ocupar o novo (pode ser no mesmo horário com outra data).
  const { error: e1 } = await supabase.from("agendamentos").update({ status: "remarcado" }).eq("id", antigo.id);
  if (e1) return { erro: "Não foi possível remarcar." };
  const { data: novo, error } = await supabase
    .from("agendamentos")
    .insert({
      cliente_id: antigo.cliente_id,
      profissional_id: antigo.profissional_id,
      servico_id: antigo.servico_id,
      inicio: inicio.toISOString(),
      fim: new Date(inicio.getTime() + duracao).toISOString(),
      observacao: antigo.observacao,
      remarcado_de: antigo.id,
    })
    .select("id")
    .single();
  if (error) {
    await supabase.from("agendamentos").update({ status: "agendado" }).eq("id", antigo.id);
    return { erro: error.code === "23P01" ? CONFLITO : "Não foi possível remarcar." };
  }
  await supabase.rpc("cancelar_mensagens_agendamento", { p_agendamento: antigo.id });
  await planejarMensagens(supabase, novo.id);
  revalidar();
  redirect(`/app/agenda/${novo.id}`);
}

export async function salvarConfigAgenda(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const r = z
    .object({
      agenda_ativa: z.boolean(),
      horario_abertura: hora,
      horario_fechamento: hora,
      dias_funcionamento: z.array(z.coerce.number().int().min(0).max(6)).max(7),
    })
    .refine((d) => d.horario_fechamento > d.horario_abertura, { error: "O fechamento precisa ser depois da abertura.", path: ["horario_fechamento"] })
    .safeParse({
      agenda_ativa: form.get("agenda_ativa") === "on",
      horario_abertura: form.get("horario_abertura"),
      horario_fechamento: form.get("horario_fechamento"),
      dias_funcionamento: form.getAll("dias_funcionamento"),
    });
  if (!r.success) return { erros: errosPorCampo(r.error) };
  const { supabase, empresa } = await exigirCliente();
  const { error } = await supabase.from("empresas").update(r.data).eq("id", empresa.id);
  if (error) return { erro: "Não foi possível salvar." };
  revalidar();
  return { sucesso: "Agenda atualizada." };
}
