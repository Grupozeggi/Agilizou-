import "server-only";
import { formatarData } from "@/lib/datas";
import { formatarReais, percentual, somar } from "@/lib/dinheiro";
import { formatarQuantidade, margemProduto } from "@/lib/estoque";
import { maiuscula, nomeDoMes } from "@/lib/lancamentos";
import { carregarResumo } from "@/lib/resumo";
import type { criarClienteServidor } from "@/lib/supabase/servidor";
import { listarProdutos } from "../produtos/dados";

type Supabase = Awaited<ReturnType<typeof criarClienteServidor>>;

/** Célula tipada: o formato muda entre tela/PDF (R$ 1.234,56) e CSV (1234,56). */
export type Celula = string | { c: number } | { q: number } | { p: number | null };

export type Relatorio = {
  id: TipoRelatorio;
  titulo: string;
  colunas: { rotulo: string; largura: number; direita?: boolean }[];
  linhas: Celula[][];
  total?: Celula[];
};

export const RELATORIOS = {
  resultado: "Resultado do período",
  "mais-vendidos": "Mais vendidos",
  margem: "Produtos com maior margem",
  despesas: "Despesas por categoria",
  lucro: "Evolução do lucro",
} as const;
export type TipoRelatorio = keyof typeof RELATORIOS;

export type Mais = { descricao: string; tipo: string; quantidade: number; receita: number; custo: number; lucro: number; vendas: number };
export type LucroMes = { mes: string; receitas: number; custos: number; despesas: number; lucro: number };

export async function carregarRelatorios(supabase: Supabase, inicio: string, fim: string) {
  const [resumo, mais, lucro, produtos] = await Promise.all([
    carregarResumo(supabase, inicio, fim),
    supabase.rpc("relatorio_mais_vendidos", { p_inicio: inicio, p_fim: fim, p_limite: 50 }).then((r) => (r.data ?? []) as Mais[]),
    supabase.rpc("relatorio_lucro_mensal", { p_fim: fim, p_meses: 12 }).then((r) => (r.data ?? []) as LucroMes[]),
    listarProdutos(supabase),
  ]);

  const despesas = resumo.por_categoria.filter((c) => c.grupo !== "receita");
  const totalDespesas = somar(despesas.map((d) => d.total));
  const margens = produtos
    .filter((p) => p.preco_centavos > 0)
    .map((p) => ({ p, m: margemProduto(p.preco_centavos, p.custo_centavos) }))
    .sort((a, b) => (b.m.percentual ?? -Infinity) - (a.m.percentual ?? -Infinity));

  const relatorios: Record<TipoRelatorio, Relatorio> = {
    resultado: {
      id: "resultado",
      titulo: RELATORIOS.resultado,
      colunas: [
        { rotulo: "Linha", largura: 0.7 },
        { rotulo: "Valor", largura: 0.3, direita: true },
      ],
      linhas: [
        ["Receitas", { c: resumo.receitas }],
        ["(−) Custos", { c: -resumo.custos }],
        ["(−) Despesas", { c: -resumo.despesas }],
      ],
      total: ["(=) Lucro", { c: resumo.receitas - resumo.custos - resumo.despesas }],
    },
    "mais-vendidos": {
      id: "mais-vendidos",
      titulo: RELATORIOS["mais-vendidos"],
      colunas: [
        { rotulo: "Item", largura: 0.34 },
        { rotulo: "Qtd", largura: 0.1, direita: true },
        { rotulo: "Vendido", largura: 0.19, direita: true },
        { rotulo: "Custo", largura: 0.18, direita: true },
        { rotulo: "Lucro", largura: 0.19, direita: true },
      ],
      linhas: mais.map((m) => [m.descricao, { q: m.quantidade }, { c: m.receita }, { c: m.custo }, { c: m.lucro }]),
      total: ["Total", { q: mais.reduce((s, m) => s + m.quantidade, 0) }, { c: somar(mais.map((m) => m.receita)) }, { c: somar(mais.map((m) => m.custo)) }, { c: somar(mais.map((m) => m.lucro)) }],
    },
    margem: {
      id: "margem",
      titulo: RELATORIOS.margem,
      colunas: [
        { rotulo: "Cód.", largura: 0.1 },
        { rotulo: "Produto", largura: 0.34 },
        { rotulo: "Custo", largura: 0.15, direita: true },
        { rotulo: "Preço", largura: 0.15, direita: true },
        { rotulo: "Ganho/un.", largura: 0.14, direita: true },
        { rotulo: "Margem", largura: 0.12, direita: true },
      ],
      linhas: margens.map(({ p, m }) => [`#${String(p.codigo).padStart(4, "0")}`, p.nome, { c: p.custo_centavos }, { c: p.preco_centavos }, { c: m.valor }, { p: m.percentual }]),
    },
    despesas: {
      id: "despesas",
      titulo: RELATORIOS.despesas,
      colunas: [
        { rotulo: "Categoria", largura: 0.45 },
        { rotulo: "Tipo", largura: 0.15 },
        { rotulo: "Total", largura: 0.22, direita: true },
        { rotulo: "% do total", largura: 0.18, direita: true },
      ],
      linhas: despesas.map((d) => [d.categoria, d.grupo === "custo" ? "Custo" : "Despesa", { c: d.total }, { p: percentual(d.total, totalDespesas) }]),
      total: ["Total", "", { c: totalDespesas }, { p: totalDespesas ? 100 : null }],
    },
    lucro: {
      id: "lucro",
      titulo: RELATORIOS.lucro,
      colunas: [
        { rotulo: "Mês", largura: 0.24 },
        { rotulo: "Receitas", largura: 0.19, direita: true },
        { rotulo: "Custos", largura: 0.19, direita: true },
        { rotulo: "Despesas", largura: 0.19, direita: true },
        { rotulo: "Lucro", largura: 0.19, direita: true },
      ],
      linhas: lucro.map((l) => [maiuscula(nomeDoMes(l.mes)), { c: l.receitas }, { c: l.custos }, { c: l.despesas }, { c: l.lucro }]),
      total: ["12 meses", { c: somar(lucro.map((l) => l.receitas)) }, { c: somar(lucro.map((l) => l.custos)) }, { c: somar(lucro.map((l) => l.despesas)) }, { c: somar(lucro.map((l) => l.lucro)) }],
    },
  };
  return { relatorios, resumo, mais, lucro, despesas, totalDespesas, margens };
}

export function periodoTexto(inicio: string, fim: string) {
  return inicio.slice(8) === "01" && fim.slice(0, 7) === inicio.slice(0, 7) && Number(fim.slice(8)) >= 28
    ? nomeDoMes(inicio.slice(0, 7))
    : `${formatarData(inicio)} a ${formatarData(fim)}`;
}

/** Célula para tela e PDF. */
export function celulaTexto(c: Celula): string {
  if (typeof c === "string") return c;
  if ("c" in c) return formatarReais(c.c);
  if ("q" in c) return formatarQuantidade(c.q);
  return c.p === null ? "—" : `${c.p.toLocaleString("pt-BR")}%`;
}
