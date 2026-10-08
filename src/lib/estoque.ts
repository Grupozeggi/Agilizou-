/**
 * Cálculos de produto e venda (em centavos). Os mesmos números são
 * recalculados no banco ao salvar; aqui servem para mostrar na tela.
 */
import { multiplicar, percentual, somar, type Centavos } from "./dinheiro";

export type Margem = {
  /** Quanto sobra por unidade: preço - custo. */
  valor: Centavos;
  /** Margem sobre o preço de venda, em % com 1 casa (null se preço zero). */
  percentual: number | null;
};

export function margemProduto(precoCentavos: Centavos, custoCentavos: Centavos): Margem {
  const valor = precoCentavos - custoCentavos;
  return { valor, percentual: percentual(valor, precoCentavos) };
}

export function estoqueBaixo(estoque: number, minimo: number): boolean {
  return minimo > 0 && estoque <= minimo;
}

export type ItemCarrinho = {
  quantidade: number;
  preco_unitario_centavos: Centavos;
  custo_unitario_centavos: Centavos;
};

/** Totais da venda: subtotal, desconto, total, custo e lucro. */
export function totaisVenda(itens: ItemCarrinho[], descontoCentavos: Centavos) {
  const subtotal = somar(itens.map((i) => multiplicar(i.preco_unitario_centavos, i.quantidade)));
  const custo = somar(itens.map((i) => multiplicar(i.custo_unitario_centavos, i.quantidade)));
  const desconto = Math.min(Math.max(0, descontoCentavos), subtotal);
  const total = subtotal - desconto;
  return { subtotal, desconto, total, custo, lucro: total - custo };
}

/** Quantidade no padrão brasileiro: 1,5 kg; 3 un. */
export function formatarQuantidade(qtd: number, unidade?: string): string {
  const n = qtd.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  return unidade ? `${n} ${unidade}` : n;
}

export const UNIDADES = ["un", "kg", "g", "l", "ml", "m", "cx", "pct", "par"] as const;

/**
 * Lê quantidade digitada ("1,5", "2", "0,250") com até 3 casas.
 * Retorna null se inválida.
 */
export function paraQuantidade(texto: string): number | null {
  const s = texto.trim().replace(/\./g, "").replace(",", ".");
  if (!/^\d{1,7}(\.\d{1,3})?$/.test(s)) return null;
  return Number(s);
}
