import { describe, expect, it } from "vitest";
import { horariosLivres, instanteSp, minutosDisponiveis, partesSp, taxas } from "./agenda";

describe("horários", () => {
  it("converte para o fuso de São Paulo", () => {
    expect(instanteSp("2026-10-08", "14:30")).toBe("2026-10-08T14:30:00-03:00");
    expect(partesSp("2026-10-08T17:30:00Z")).toEqual({ data: "2026-10-08", hora: "14:30" });
    expect(partesSp("2026-10-09T01:00:00Z")).toEqual({ data: "2026-10-08", hora: "22:00" });
  });

  it("lista horários livres sem conflito, dentro do expediente", () => {
    const livres = horariosLivres({
      abertura: "08:00",
      fechamento: "10:00",
      duracao: 30,
      ocupados: [{ inicio: 8 * 60 + 30, fim: 9 * 60 }],
    });
    expect(livres).toEqual(["08:00", "09:00", "09:15", "09:30"]);
  });

  it("serviço longo não cabe no fim do dia; horários passados somem", () => {
    expect(horariosLivres({ abertura: "08:00", fechamento: "09:00", duracao: 60, ocupados: [] })).toEqual(["08:00"]);
    expect(horariosLivres({ abertura: "08:00", fechamento: "09:00", duracao: 15, ocupados: [], aPartirDe: 8 * 60 + 20 })).toEqual([
      "08:30",
      "08:45",
    ]);
  });
});

describe("indicadores", () => {
  it("minutos de expediente na semana (seg a sáb, 8h–18h, 2 profissionais)", () => {
    expect(minutosDisponiveis({ inicio: "2026-10-05", fim: "2026-10-11", dias: [1, 2, 3, 4, 5, 6], abertura: "08:00", fechamento: "18:00", profissionais: 2 })).toBe(
      6 * 600 * 2,
    );
  });

  it("taxas de comparecimento, falta, retorno e horas vagas", () => {
    const t = taxas(
      { total: 6, compareceu: 2, faltou: 3, receita_perdida: 15000, minutos_ocupados: 180, faltas_por_cliente: [], clientes_atendidos_90d: 4, clientes_que_voltaram_90d: 1 },
      600,
    );
    expect(t).toEqual({ comparecimento: 40, falta: 60, retorno: 25, ocupacao: 30, horasVagas: 7 });
  });

  it("sem dados não divide por zero", () => {
    const t = taxas({ total: 0, compareceu: 0, faltou: 0, receita_perdida: 0, minutos_ocupados: 0, faltas_por_cliente: [], clientes_atendidos_90d: 0, clientes_que_voltaram_90d: 0 }, 0);
    expect(t.comparecimento).toBeNull();
    expect(t.retorno).toBeNull();
  });
});
