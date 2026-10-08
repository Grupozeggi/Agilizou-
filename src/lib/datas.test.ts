import { describe, expect, it } from "vitest";
import { dataSp, diasEntre, formatarData, hojeIso, paraIso, somarDias } from "./datas";

describe("datas", () => {
  it("formata e converte dd/mm/aaaa", () => {
    expect(formatarData("2026-10-08")).toBe("08/10/2026");
    expect(paraIso("08/10/2026")).toBe("2026-10-08");
  });

  it("rejeita data que não existe", () => {
    expect(paraIso("31/02/2026")).toBeNull();
    expect(paraIso("2026-10-08")).toBeNull();
  });

  it("hoje é calculado no fuso de São Paulo", () => {
    // 02:00 UTC do dia 9 ainda é dia 8 em São Paulo (UTC-3)
    expect(hojeIso(new Date("2026-10-09T02:00:00Z"))).toBe("2026-10-08");
  });

  it("soma dias atravessando mês e ano", () => {
    expect(somarDias("2026-12-30", 3)).toBe("2027-01-02");
    expect(diasEntre("2026-10-08", "2026-10-15")).toBe(7);
  });
});

describe("dataSp", () => {
  it("converte timestamptz para a data de São Paulo", () => {
    expect(dataSp("2026-10-15T02:44:00+00:00")).toBe("2026-10-14");
    expect(dataSp("2026-10-15T12:00:00Z")).toBe("2026-10-15");
  });
});
