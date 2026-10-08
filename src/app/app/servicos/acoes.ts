"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { paraCentavos } from "@/lib/dinheiro";
import { errosPorCampo, type EstadoForm } from "@/lib/formulario";
import { exigirEscrita } from "@/lib/sessao";
import { dadosDoForm } from "../lancamentos/validacao";

const centavos = (rotulo: string) =>
  z.string().transform((v, ctx) => {
    const c = paraCentavos(v || "0");
    if (c === null || c < 0) {
      ctx.addIssue({ code: "custom", message: `${rotulo} inválido.` });
      return z.NEVER;
    }
    return c;
  });

const esquema = z.object({
  id: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  nome: z.string().trim().min(1, { error: "Digite o nome do serviço." }).max(120),
  preco: centavos("Preço"),
  custo: centavos("Custo"),
  duracao_minutos: z.coerce
    .number({ error: "Duração inválida." })
    .int()
    .min(5, { error: "Mínimo de 5 minutos." })
    .max(720, { error: "Máximo de 12 horas." }),
});

export async function salvarServico(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const r = esquema.safeParse(dadosDoForm(form));
  if (!r.success) return { erros: errosPorCampo(r.error) };
  const { id, nome, preco, custo, duracao_minutos } = r.data;
  const { supabase, bloqueio } = await exigirEscrita();
  if (bloqueio) return { erro: bloqueio, limiteAtingido: true };
  const dados = { nome, preco_centavos: preco, custo_centavos: custo, duracao_minutos };
  const { error } = id
    ? await supabase.from("servicos").update(dados).eq("id", id).is("deleted_at", null)
    : await supabase.from("servicos").insert(dados);
  if (error) {
    console.error("[serviços]", error);
    return { erro: "Não foi possível salvar o serviço." };
  }
  revalidatePath("/app/servicos");
  return { sucesso: id ? "Serviço atualizado." : "Serviço cadastrado." };
}

export async function excluirServico(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const id = String(form.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) return { erro: "Serviço inválido." };
  const { supabase, bloqueio } = await exigirEscrita();
  if (bloqueio) return { erro: bloqueio, limiteAtingido: true };
  const { error } = await supabase.from("servicos").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { erro: "Não foi possível excluir." };
  revalidatePath("/app/servicos");
  return {};
}
