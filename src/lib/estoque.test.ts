import { describe, expect, it } from "vitest";
import { estoqueBaixo, formatarQuantidade, margemProduto, paraQuantidade, totaisVenda } from "./estoque";

describe("margem por produto", () => {
  it("preço - custo e % sobre o preço", () => {
    expect(margemProduto(3500, 2000)).toEqual({ valor: 1500, percentual: 42.9 });
    expect(margemProduto(1000, 1200)).toEqual({ valor: -200, percentual: -20 });
    expect(margemProduto(0, 0)).toEqual({ valor: 0, percentual: null });
  });
});

describe("estoque baixo", () => {
  it("alerta quando chega no mínimo", () => {
    expect(estoqueBaixo(5, 5)).toBe(true);
    expect(estoqueBaixo(4, 5)).toBe(true);
    expect(estoqueBaixo(6, 5)).toBe(false);
    expect(estoqueBaixo(0, 0)).toBe(false); // sem mínimo definido, sem alerta
  });
});

describe("totais da venda", () => {
  it("bate com o cálculo do banco (mesmo caso do teste de RLS)", () => {
    const t = totaisVenda(
      [
        { quantidade: 4, preco_unitario_centavos: 3500, custo_unitario_centavos: 2000 },
        { quantidade: 1.5, preco_unitario_centavos: 33, custo_unitario_centavos: 13 },
        { quantidade: 1, preco_unitario_centavos: 8000, custo_unitario_centavos: 0 },
        { quantidade: 1, preco_unitario_centavos: 2000, custo_unitario_centavos: 0 },
      ],
      500,
    );
    expect(t).toEqual({ subtotal: 24050, desconto: 500, total: 23550, custo: 8020, lucro: 15530 });
  });

  it("desconto nunca passa do subtotal nem fica negativo", () => {
    const itens = [{ quantidade: 1, preco_unitario_centavos: 1000, custo_unitario_centavos: 0 }];
    expect(totaisVenda(itens, 5000).total).toBe(0);
    expect(totaisVenda(itens, -10).total).toBe(1000);
  });
});

describe("quantidade", () => {
  it("formata em pt-BR", () => {
    expect(formatarQuantidade(1.5, "kg")).toBe("1,5 kg");
    expect(formatarQuantidade(3)).toBe("3");
  });
});

describe("paraQuantidade", () => {
  it("aceita vírgula e até 3 casas", () => {
    expect(paraQuantidade("1,5")).toBe(1.5);
    expect(paraQuantidade("0,250")).toBe(0.25);
    expect(paraQuantidade("12")).toBe(12);
    expect(paraQuantidade("1.000")).toBe(1000);
  });
  it("recusa o resto", () => {
    for (const t of ["", "-1", "1,2345", "abc", "1,"]) expect(paraQuantidade(t)).toBeNull();
  });
});
