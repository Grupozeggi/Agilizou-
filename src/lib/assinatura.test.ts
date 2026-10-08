import { describe, expect, it } from "vitest";
import { mensagemSomenteLeitura, podeEscrever, validarCpfCnpj, valorProporcional } from "./assinatura";

const agora = new Date("2026-10-08T12:00:00Z");

describe("acesso pela assinatura", () => {
  it("teste válido e ativo gravam; o resto é somente leitura", () => {
    expect(podeEscrever("teste", "2026-10-15T12:00:00Z", agora)).toBe(true);
    expect(podeEscrever("teste", "2026-10-08T11:59:00Z", agora)).toBe(false);
    expect(podeEscrever("ativo", "2020-01-01T00:00:00Z", agora)).toBe(true);
    for (const s of ["inadimplente", "cancelado", "suspenso"] as const) expect(podeEscrever(s, "2030-01-01T00:00:00Z", agora)).toBe(false);
  });

  it("mensagem explica o motivo e que os dados estão guardados", () => {
    expect(mensagemSomenteLeitura("ativo", "", agora)).toBeNull();
    expect(mensagemSomenteLeitura("teste", "2026-10-01T00:00:00Z", agora)).toMatch(/teste grátis terminou.*dados estão guardados/);
    expect(mensagemSomenteLeitura("inadimplente", "", agora)).toMatch(/pagamento em aberto/);
  });
});

describe("valor proporcional do upgrade", () => {
  it("diferença pelos dias que faltam (ciclo de 30 dias)", () => {
    // R$ 97 → R$ 197 com 15 dias para a próxima cobrança = R$ 50,00
    expect(valorProporcional(9700, 19700, "2026-10-08", "2026-10-23")).toBe(5000);
    // 10 dias: 10000 × 10/30 = 3333,33 → arredonda para cima
    expect(valorProporcional(9700, 19700, "2026-10-08", "2026-10-18")).toBe(3334);
  });
  it("downgrade, sem data ou já vencido não cobram", () => {
    expect(valorProporcional(19700, 9700, "2026-10-08", "2026-10-23")).toBe(0);
    expect(valorProporcional(9700, 19700, "2026-10-08", null)).toBe(0);
    expect(valorProporcional(9700, 19700, "2026-10-08", "2026-10-01")).toBe(0);
  });
});

describe("CPF e CNPJ", () => {
  it("aceita válidos (com ou sem pontuação)", () => {
    expect(validarCpfCnpj("529.982.247-25")).toBe("52998224725");
    expect(validarCpfCnpj("11.222.333/0001-81")).toBe("11222333000181");
  });
  it("recusa inválidos", () => {
    for (const v of ["529.982.247-26", "111.111.111-11", "11.222.333/0001-80", "123", ""]) expect(validarCpfCnpj(v)).toBeNull();
  });
});
