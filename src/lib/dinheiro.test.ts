import { describe, expect, it } from "vitest";
import { formatarReais, multiplicar, paraCentavos, percentual, somar } from "./dinheiro";

describe("paraCentavos", () => {
  it.each([
    ["1.234,56", 123456],
    ["1234,56", 123456],
    ["1234.56", 123456],
    ["R$ 12", 1200],
    ["12,5", 1250],
    ["0,01", 1],
    ["1.000", 100000],
    ["-3,40", -340],
    [" 97 ", 9700],
  ])("%s → %i", (texto, esperado) => {
    expect(paraCentavos(texto)).toBe(esperado);
  });

  it.each(["", "abc", "1,234,5", "12,345", "1.2.3", "1,2.3"])("rejeita %j", (texto) => {
    expect(paraCentavos(texto)).toBeNull();
  });
});

describe("formatarReais", () => {
  it("formata no padrão brasileiro", () => {
    expect(formatarReais(123456)).toBe("R$ 1.234,56");
    expect(formatarReais(0)).toBe("R$ 0,00");
    expect(formatarReais(-990)).toBe("-R$ 9,90");
  });

  it("recusa valor que não é centavo inteiro", () => {
    expect(() => formatarReais(10.5)).toThrow();
  });
});

describe("somar", () => {
  it("não sofre erro de float (0,10 + 0,20 = 0,30)", () => {
    expect(somar([10, 20])).toBe(30);
  });
});

describe("multiplicar", () => {
  it("preço x quantidade inteira", () => {
    expect(multiplicar(1990, 3)).toBe(5970);
  });
  it("preço x quantidade fracionada, arredondando o centavo", () => {
    expect(multiplicar(1999, 1.5)).toBe(2999); // 29,985 → 29,99
    expect(multiplicar(333, 0.333)).toBe(111); // 1,10889 → 1,11
  });
});

describe("percentual", () => {
  it("calcula com uma casa", () => {
    expect(percentual(4000, 10000)).toBe(40);
    expect(percentual(1, 3)).toBe(33.3);
  });
  it("base zero devolve null", () => {
    expect(percentual(100, 0)).toBeNull();
  });
});
