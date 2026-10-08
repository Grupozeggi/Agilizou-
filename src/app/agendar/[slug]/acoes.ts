"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { instanteSp, partesSp } from "@/lib/agenda";
import { formatarData } from "@/lib/datas";
import { errosPorCampo, type EstadoForm } from "@/lib/formulario";
import { normalizarWhatsapp } from "@/lib/mensagens";
import { enviarPush, type Inscricao } from "@/lib/push";
import { criarClientePublico } from "@/lib/supabase/publico";
import { criarClienteServico } from "@/lib/supabase/servico";
import { planejarMensagens } from "@/app/app/mensagens/fila";

export type EstadoAgendar = EstadoForm & {
  /** Preenchido quando o horário foi marcado. */
  marcado?: { inicio: string; profissional: string | null; servico: string | null };
  /** O horário foi ocupado por outra pessoa: a tela recarrega os horários. */
  conflito?: boolean;
};

const vazio = (v: unknown) => (v === "" || v === null ? undefined : v);

const esquema = z.object({
  slug: z.string().min(3).max(60),
  servico_id: z.preprocess(vazio, z.uuid().optional()),
  profissional_id: z.preprocess(vazio, z.uuid().optional()),
  data: z.string({ error: "Escolha o dia." }).regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Escolha o dia." }),
  hora: z.string({ error: "Escolha o horário." }).regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Escolha o horário." }),
  nome: z.string({ error: "Digite o seu nome." }).trim().min(2, { error: "Digite o seu nome." }).max(120, { error: "Use no máximo 120 caracteres." }),
  whatsapp: z.string({ error: "Digite o seu WhatsApp." }).transform((v, ctx) => {
    const n = normalizarWhatsapp(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "WhatsApp inválido. Use DDD + número, ex.: (11) 99999-8888." });
      return z.NEVER;
    }
    return n;
  }),
  observacao: z.preprocess(vazio, z.string().trim().max(300, { error: "Use no máximo 300 caracteres." }).optional()),
});

type Marcado = { id: string; empresa_id: string; empresa: string; inicio: string; fim: string; profissional: string | null; servico: string | null };

/** Marca um horário pelo link público. Quem chama é um visitante sem login. */
export async function agendarOnline(_: EstadoAgendar, form: FormData): Promise<EstadoAgendar> {
  // Campo-isca: gente não vê nem preenche; robô costuma preencher tudo.
  if (String(form.get("site") ?? "") !== "") return { erro: "Não foi possível agendar. Tente de novo." };

  const r = esquema.safeParse({
    slug: form.get("slug") ?? undefined,
    servico_id: form.get("servico_id"),
    profissional_id: form.get("profissional_id"),
    data: form.get("data") ?? undefined,
    hora: form.get("hora") ?? undefined,
    nome: form.get("nome") ?? undefined,
    whatsapp: form.get("whatsapp") ?? undefined,
    observacao: form.get("observacao"),
  });
  if (!r.success) return { erros: errosPorCampo(r.error) };
  const d = r.data;

  const { data, error } = await criarClientePublico().rpc("agendar_online", {
    p_slug: d.slug,
    p_servico: d.servico_id ?? null,
    p_profissional: d.profissional_id ?? null,
    p_inicio: new Date(instanteSp(d.data, d.hora)).toISOString(),
    p_nome: d.nome,
    p_whatsapp: d.whatsapp,
    p_observacao: d.observacao ?? null,
  });

  if (error) {
    // As mensagens destes códigos são escritas por nós, no banco, para o cliente ler.
    if (error.code === "23P01") return { erro: error.message, conflito: true };
    if (error.code === "22023" || error.code === "P0001" || error.code === "P0002") return { erro: error.message };
    console.error("[agendar online]", error);
    return { erro: "Não foi possível agendar agora. Tente de novo em instantes." };
  }

  const marcado = data as Marcado;
  await avisarEmpresa(marcado, d.nome);
  revalidatePath("/app", "layout");
  return { marcado: { inicio: marcado.inicio, profissional: marcado.profissional, servico: marcado.servico } };
}

/**
 * Depois de marcar: põe na fila as mensagens de confirmação do WhatsApp e
 * avisa o dono no celular. Nada aqui pode derrubar o agendamento, que já
 * está gravado: qualquer falha só vai para o log.
 */
async function avisarEmpresa(m: Marcado, nomeCliente: string) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const db = criarClienteServico();
    await planejarMensagens(db, m.id);

    const { data: empresa } = await db.from("empresas").select("aviso_push").eq("id", m.empresa_id).maybeSingle();
    if (!empresa?.aviso_push) return;
    const { data: inscricoes } = await db.from("notificacoes_push").select("id, endpoint, p256dh, auth").eq("empresa_id", m.empresa_id);
    const { data: dia, hora } = partesSp(m.inicio);
    for (const i of (inscricoes ?? []) as (Inscricao & { id: string })[]) {
      const resultado = await enviarPush(i, {
        titulo: "Novo agendamento pelo link",
        corpo: `${nomeCliente.split(" ")[0]} marcou ${m.servico ?? "um horário"} em ${formatarData(dia).slice(0, 5)} às ${hora}.`,
        url: `/app/agenda?dia=${dia}`,
      });
      if (resultado === "expirada") await db.from("notificacoes_push").delete().eq("id", i.id);
    }
  } catch (e) {
    console.error("[agendar online] aviso", m.id, e);
  }
}
