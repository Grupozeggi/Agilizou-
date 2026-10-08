"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hojeIso } from "@/lib/datas";
import { errosPorCampo, type EstadoForm } from "@/lib/formulario";
import { gerarParcelas, gerarRecorrencias, type Ocorrencia } from "@/lib/lancamentos";
import { usoLancamentos } from "@/lib/limites";
import { exigirCliente } from "@/lib/sessao";
import { dadosDoForm, esquemaEditarLancamento, esquemaExcluir, esquemaId, esquemaNovoLancamento } from "./validacao";

// Todas as ações usam o cliente do usuário: a RLS garante que só a empresa
// dele é lida ou alterada, mesmo que alguém forje um id no formulário.

const ERRO_GENERICO = "Não foi possível salvar agora. Tente de novo em instantes.";

function revalidar() {
  revalidatePath("/app", "layout");
}

function erroDoBanco(contexto: string, error: { code?: string; message?: string }): EstadoForm {
  console.error(`[lançamentos] ${contexto}`, error);
  if (error.message?.includes("não combina")) return { erros: { categoria_id: "Essa categoria não é deste tipo." } };
  if (error.code === "23503") return { erros: { categoria_id: "Categoria não encontrada. Atualize a página." } };
  return { erro: ERRO_GENERICO };
}

export async function criarLancamento(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const r = esquemaNovoLancamento.safeParse(dadosDoForm(form));
  if (!r.success) return { erros: errosPorCampo(r.error) };
  const d = r.data;

  const { supabase, empresa } = await exigirCliente();
  const uso = await usoLancamentos(supabase, empresa);
  if (uso.situacao === "bloqueado") return { erro: uso.mensagem, limiteAtingido: true };

  let ocorrencias: Ocorrencia[];
  if (d.repeticao === "parcelado") ocorrencias = gerarParcelas(d.valor, d.vezes!, d.data);
  else if (d.repeticao === "recorrente") ocorrencias = gerarRecorrencias(d.valor, d.vezes!, d.data);
  else ocorrencias = [{ valor_centavos: d.valor, data: d.data, numero: 1, total: 1 }];

  const grupo = ocorrencias.length > 1 ? randomUUID() : null;
  const hoje = hojeIso();
  const linhas = ocorrencias.map((o) => {
    // Só a primeira pode nascer paga; as próximas ficam pendentes até o dia delas.
    const pago = o.numero === 1 && d.pago;
    return {
      tipo: d.tipo,
      valor_centavos: o.valor_centavos,
      categoria_id: d.categoria_id,
      data: o.data,
      vencimento: o.data,
      status: pago ? "pago" : "pendente",
      pago_em: pago ? (o.data > hoje ? hoje : o.data) : null,
      forma_pagamento: d.forma_pagamento ?? null,
      descricao: d.descricao ?? null,
      observacao: d.observacao ?? null,
      grupo_id: grupo,
      parcela_numero: grupo ? o.numero : null,
      parcela_total: grupo ? o.total : null,
      recorrente: d.repeticao === "recorrente",
    };
  });

  // Um único insert com todas as linhas: ou entram todas, ou nenhuma.
  const { error } = await supabase.from("lancamentos").insert(linhas);
  if (error) return erroDoBanco("criar", error);

  revalidar();
  const quantas = linhas.length > 1 ? ` (${linhas.length} meses)` : "";
  return {
    sucesso: `${d.tipo === "entrada" ? "Entrada" : "Saída"} salva${quantas}.`,
    aviso: uso.situacao === "aviso" ? uso.mensagem : undefined,
  };
}

export async function editarLancamento(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const r = esquemaEditarLancamento.safeParse(dadosDoForm(form));
  if (!r.success) return { erros: errosPorCampo(r.error) };
  const d = r.data;
  const { supabase } = await exigirCliente();

  const { data: atual, error: erroBusca } = await supabase
    .from("lancamentos")
    .select("id, grupo_id, data, status")
    .eq("id", d.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (erroBusca || !atual) return { erro: "Lançamento não encontrado." };

  const hoje = hojeIso();
  // Este lançamento: tudo pode mudar, inclusive data e status.
  const { error } = await supabase
    .from("lancamentos")
    .update({
      valor_centavos: d.valor,
      categoria_id: d.categoria_id,
      data: d.data,
      vencimento: d.data,
      status: d.pago ? "pago" : "pendente",
      pago_em: d.pago ? (d.data > hoje ? hoje : d.data) : null,
      forma_pagamento: d.forma_pagamento ?? null,
      descricao: d.descricao ?? null,
      observacao: d.observacao ?? null,
    })
    .eq("id", d.id);
  if (error) return erroDoBanco("editar", error);

  // Próximos da mesma série: muda valor, categoria e textos (datas e status ficam).
  if (d.escopo === "proximos" && atual.grupo_id) {
    const { error: erroSerie } = await supabase
      .from("lancamentos")
      .update({
        valor_centavos: d.valor,
        categoria_id: d.categoria_id,
        forma_pagamento: d.forma_pagamento ?? null,
        descricao: d.descricao ?? null,
        observacao: d.observacao ?? null,
      })
      .eq("grupo_id", atual.grupo_id)
      .gt("data", atual.data)
      .neq("id", d.id)
      .is("deleted_at", null);
    if (erroSerie) return erroDoBanco("editar série", erroSerie);
  }

  revalidar();
  redirect(`/app/lancamentos?mes=${d.data.slice(0, 7)}`);
}

/** Exclusão lógica (deleted_at). O admin consegue restaurar. */
export async function excluirLancamento(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const r = esquemaExcluir.safeParse(dadosDoForm(form));
  if (!r.success) return { erro: "Lançamento inválido." };
  const { supabase } = await exigirCliente();

  const { data: atual } = await supabase
    .from("lancamentos")
    .select("id, grupo_id, data")
    .eq("id", r.data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!atual) return { erro: "Lançamento não encontrado." };

  const agora = new Date().toISOString();
  let consulta = supabase.from("lancamentos").update({ deleted_at: agora }).is("deleted_at", null);
  consulta =
    r.data.escopo === "proximos" && atual.grupo_id
      ? consulta.eq("grupo_id", atual.grupo_id).gte("data", atual.data)
      : consulta.eq("id", atual.id);
  const { error } = await consulta;
  if (error) return erroDoBanco("excluir", error);

  revalidar();
  redirect(`/app/lancamentos?mes=${atual.data.slice(0, 7)}`);
}

/** Um toque: marca como pago/recebido hoje. */
export async function marcarComoPago(id: string): Promise<EstadoForm> {
  const r = esquemaId.safeParse({ id });
  if (!r.success) return { erro: "Lançamento inválido." };
  const { supabase } = await exigirCliente();
  const hoje = hojeIso();

  const { data, error } = await supabase
    .from("lancamentos")
    .update({ status: "pago", pago_em: hoje, data: hoje })
    .eq("id", r.data.id)
    .eq("status", "pendente")
    .is("deleted_at", null)
    .select("id");
  if (error) return erroDoBanco("pagar", error);
  if (!data?.length) return { erro: "Esta conta já foi paga ou não existe mais." };

  revalidar();
  return { sucesso: "Pronto!" };
}

/** Desfaz o "marcar como pago": volta a pendente na data do vencimento. */
export async function desfazerPagamento(id: string): Promise<EstadoForm> {
  const r = esquemaId.safeParse({ id });
  if (!r.success) return { erro: "Lançamento inválido." };
  const { supabase } = await exigirCliente();

  const { data: atual } = await supabase
    .from("lancamentos")
    .select("vencimento, data")
    .eq("id", r.data.id)
    .eq("status", "pago")
    .is("deleted_at", null)
    .maybeSingle();
  if (!atual) return { erro: "Não foi possível desfazer." };

  const { error } = await supabase
    .from("lancamentos")
    .update({ status: "pendente", pago_em: null, data: atual.vencimento ?? atual.data })
    .eq("id", r.data.id);
  if (error) return erroDoBanco("desfazer", error);

  revalidar();
  return { sucesso: "Desfeito." };
}
