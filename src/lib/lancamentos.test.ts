import { describe, expect, it } from "vitest";
import { somar } from "./dinheiro";
import {
  gerarParcelas,
  gerarRecorrencias,
  limitesDoMes,
  nomeDoMes,
  situacaoConta,
  somarMeses,
  textoVencimento,
} from "./lancamentos";

describe("somarMeses", () => {
  it("mantém o dia", () => {
    expect(somarMeses("2026-10-15", 1)).toBe("2026-11-15");
    expect(somarMeses("2026-11-15", 2)).toBe("2027-01-15");
  });

  it("dia 31 vira o último dia do mês curto e volta ao 31 depois", () => {
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMeses("2028-01-31", 1)).toBe("2028-02-29"); // bissexto
    expect(somarMeses("2026-01-31", 2)).toBe("2026-03-31");
    expect(somarMeses("2026-01-31", 3)).toBe("2026-04-30");
  });
});

describe("gerarParcelas", () => {
  it("a soma das parcelas é exatamente o total", () => {
    for (const [total, vezes] of [
      [10000, 3],
      [9999, 7],
      [1, 1],
      [123456789, 48],
      [100, 60],
    ]) {
      const p = gerarParcelas(total, vezes, "2026-10-08");
      expect(p).toHaveLength(vezes);
      expect(somar(p.map((x) => x.valor_centavos))).toBe(total);
      // nenhuma parcela difere de outra em mais de 1 centavo
      const valores = p.map((x) => x.valor_centavos);
      expect(Math.max(...valores) - Math.min(...valores)).toBeLessThanOrEqual(1);
    }
  });

  it("R$ 100 em 3x = 33,34 + 33,33 + 33,33, uma por mês", () => {
    expect(gerarParcelas(10000, 3, "2026-10-08")).toEqual([
      { valor_centavos: 3334, data: "2026-10-08", numero: 1, total: 3 },
      { valor_centavos: 3333, data: "2026-11-08", numero: 2, total: 3 },
      { valor_centavos: 3333, data: "2026-12-08", numero: 3, total: 3 },
    ]);
  });

  it("recusa divisão impossível", () => {
    expect(() => gerarParcelas(2, 3, "2026-10-08")).toThrow();
    expect(() => gerarParcelas(1000, 0, "2026-10-08")).toThrow();
    expect(() => gerarParcelas(1000, 61, "2026-10-08")).toThrow();
  });
});

describe("gerarRecorrencias", () => {
  it("repete o mesmo valor todo mês", () => {
    const r = gerarRecorrencias(150000, 12, "2026-10-05");
    expect(r).toHaveLength(12);
    expect(r.every((x) => x.valor_centavos === 150000)).toBe(true);
    expect(r[11].data).toBe("2027-09-05");
  });
});

describe("situação das contas", () => {
  const hoje = "2026-10-08";
  it("classifica por vencimento", () => {
    expect(situacaoConta("2026-10-07", hoje)).toBe("vencida");
    expect(situacaoConta("2026-10-08", hoje)).toBe("hoje");
    expect(situacaoConta("2026-10-09", hoje)).toBe("proximos7");
    expect(situacaoConta("2026-10-15", hoje)).toBe("proximos7");
    expect(situacaoConta("2026-10-16", hoje)).toBe("depois");
  });

  it("explica o vencimento em palavras", () => {
    expect(textoVencimento("2026-10-08", hoje)).toBe("vence hoje");
    expect(textoVencimento("2026-10-09", hoje)).toBe("vence amanhã");
    expect(textoVencimento("2026-10-07", hoje)).toBe("venceu ontem");
    expect(textoVencimento("2026-10-01", hoje)).toBe("venceu há 7 dias");
    expect(textoVencimento("2026-10-20", hoje)).toBe("vence em 12 dias");
  });
});

describe("mês", () => {
  it("primeiro e último dia", () => {
    expect(limitesDoMes("2026-02-14")).toEqual({ inicio: "2026-02-01", fim: "2026-02-28" });
    expect(limitesDoMes("2026-12-31")).toEqual({ inicio: "2026-12-01", fim: "2026-12-31" });
  });
  it("nome por extenso", () => {
    expect(nomeDoMes("2026-10")).toBe("outubro de 2026");
  });
});
