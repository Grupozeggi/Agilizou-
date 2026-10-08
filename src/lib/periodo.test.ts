import { describe, expect, it } from "vitest";
import { inicioDaSemana, resolverPeriodo } from "./periodo";

const hoje = "2026-10-08"; // quinta-feira

describe("período do dashboard", () => {
  it("semana começa na segunda", () => {
    expect(inicioDaSemana(hoje)).toBe("2026-10-05");
    expect(inicioDaSemana("2026-10-11")).toBe("2026-10-05"); // domingo
    expect(inicioDaSemana("2026-10-05")).toBe("2026-10-05");
  });

  it("resolve cada opção", () => {
    expect(resolverPeriodo({}, hoje)).toEqual({ tipo: "mes", inicio: "2026-10-01", fim: "2026-10-31" });
    expect(resolverPeriodo({ periodo: "hoje" }, hoje)).toEqual({ tipo: "hoje", inicio: hoje, fim: hoje });
    expect(resolverPeriodo({ periodo: "semana" }, hoje)).toEqual({ tipo: "semana", inicio: "2026-10-05", fim: "2026-10-11" });
    expect(resolverPeriodo({ periodo: "personalizado", de: "2026-09-10", ate: "2026-10-02" }, hoje)).toEqual({
      tipo: "personalizado",
      inicio: "2026-09-10",
      fim: "2026-10-02",
    });
  });

  it("personalizado invertido é corrigido; inválido volta para o mês", () => {
    expect(resolverPeriodo({ periodo: "personalizado", de: "2026-10-02", ate: "2026-09-10" }, hoje).inicio).toBe("2026-09-10");
    expect(resolverPeriodo({ periodo: "personalizado", de: "2026-02-30", ate: "2026-03-01" }, hoje).tipo).toBe("mes");
    expect(resolverPeriodo({ periodo: "personalizado", de: "2010-01-01", ate: "2026-01-01" }, hoje).tipo).toBe("mes");
  });
});
