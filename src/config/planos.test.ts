import { describe, expect, it } from "vitest";
import { limitesDaEmpresa, situacaoLimite } from "./planos";

describe("situacaoLimite", () => {
  it("avisa a partir de 80% e bloqueia em 100%", () => {
    expect(situacaoLimite(239, 300)).toBe("ok");
    expect(situacaoLimite(240, 300)).toBe("aviso");
    expect(situacaoLimite(299, 300)).toBe("aviso");
    expect(situacaoLimite(300, 300)).toBe("bloqueado");
  });

  it("ilimitado nunca bloqueia", () => {
    expect(situacaoLimite(1_000_000, Infinity)).toBe("ok");
  });

  it("limite zero bloqueia o recurso", () => {
    expect(situacaoLimite(0, 0)).toBe("bloqueado");
  });
});

describe("limitesDaEmpresa", () => {
  it("usa o plano e aplica o limite personalizado pelo admin", () => {
    const l = limitesDaEmpresa("essencial", { produtos: 150 });
    expect(l.produtos).toBe(150);
    expect(l.clientes).toBe(200);
  });
});
