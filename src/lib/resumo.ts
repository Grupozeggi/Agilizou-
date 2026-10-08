import "server-only";
import type { criarClienteServidor } from "@/lib/supabase/servidor";

type Supabase = Awaited<ReturnType<typeof criarClienteServidor>>;
type Contagem = { qtd: number; total: number };

/** Resultado de resumo_financeiro() no banco (valores em centavos). */
export type Resumo = {
  hoje: string;
  saldo_inicial: number;
  saldo_atual: number;
  entradas: number;
  saidas: number;
  receitas: number;
  custos: number;
  despesas: number;
  a_receber_periodo: number;
  a_pagar_periodo: number;
  pagar_vencidas: Contagem;
  pagar_7dias: Contagem;
  receber_vencidas: Contagem;
  receber_7dias: Contagem;
  por_categoria: { categoria: string; grupo: "receita" | "custo" | "despesa"; total: number }[];
  serie: { mes: string; entradas: number; saidas: number }[];
};

export async function carregarResumo(supabase: Supabase, inicio: string, fim: string): Promise<Resumo> {
  const { data, error } = await supabase.rpc("resumo_financeiro", { p_inicio: inicio, p_fim: fim });
  if (error) {
    console.error("[resumo]", error);
    throw new Error("Não foi possível calcular o resumo financeiro.");
  }
  return data as Resumo;
}

/** Lucro do resultado do mês. */
export const lucro = (r: Pick<Resumo, "receitas" | "custos" | "despesas">) => r.receitas - r.custos - r.despesas;
