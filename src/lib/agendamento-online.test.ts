import { describe, expect, it } from "vitest";
import { diasAbertos, gerarSlug, horariosDoDia, primeiroDiaComHorario, rotuloDoDia, slugValido, type AgendaPublica } from "./agendamento-online";

const horario: AgendaPublica["horario"] = {
  abertura: "08:00",
  fechamento: "12:00",
  dias: [1, 2, 3, 4, 5, 6],
  dias_adiante: 7,
  antecedencia_horas: 1,
  datas_fechadas: [],
};
const ana = { id: "ana", nome: "Ana" };
const bia = { id: "bia", nome: "Bia" };
// 2026-10-08 é uma quinta-feira
const agenda = (extra: Partial<Pick<AgendaPublica, "horario" | "profissionais" | "ocupados">> = {}) => ({
  horario,
  profissionais: [ana, bia],
  ocupados: [] as AgendaPublica["ocupados"],
  ...extra,
});
const sp = (dia: string, hora: string) => `${dia}T${hora}:00-03:00`;

describe("endereço do link (slug)", () => {
  it("tira acento, espaço e símbolo, igual ao banco", () => {
    expect(gerarSlug("  Barbearia do Zé (demonstração) ")).toBe("barbearia-do-ze-demonstracao");
    expect(gerarSlug("Clínica Sorriso & Cia.")).toBe("clinica-sorriso-cia");
    expect(gerarSlug("Zé")).toBe("empresa-ze");
    expect(gerarSlug("!!!")).toBe("empresa");
  });

  it("corta nomes longos sem deixar traço na ponta", () => {
    const s = gerarSlug("a".repeat(49) + " bcd");
    expect(s).toBe("a".repeat(49));
    expect(slugValido(s)).toBe(true);
  });

  it("valida o formato", () => {
    expect(slugValido("barbearia-do-ze")).toBe(true);
    expect(slugValido("ab")).toBe(false);
    expect(slugValido("Com-Maiuscula")).toBe(false);
    expect(slugValido("duplo--traco")).toBe(false);
    expect(slugValido("-comeca-com-traco")).toBe(false);
    expect(slugValido("a".repeat(61))).toBe(false);
  });
});

describe("dias abertos", () => {
  it("lista de hoje até o limite, pulando dia sem atendimento e data fechada", () => {
    const dias = diasAbertos({ ...horario, datas_fechadas: ["2026-10-12"] }, "2026-10-08");
    // qui 08, sex 09, sáb 10, (dom 11 fechado), (seg 12 feriado), ter 13, qua 14, qui 15
    expect(dias).toEqual(["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-13", "2026-10-14", "2026-10-15"]);
  });

  it("empresa que não atende em dia nenhum não mostra nada", () => {
    expect(diasAbertos({ ...horario, dias: [] }, "2026-10-08")).toEqual([]);
  });
});

describe("horários do dia", () => {
  const base = { dia: "2026-10-09", duracao: 30, agoraIso: sp("2026-10-08", "09:00") };

  it("dia livre: de 15 em 15 até caber o serviço antes de fechar", () => {
    const h = horariosDoDia({ agenda: agenda(), profissional: "ana", ...base });
    expect(h[0]).toBe("08:00");
    expect(h.at(-1)).toBe("11:30");
    expect(h).toHaveLength(15);
  });

  it("tira o que encosta em horário ocupado do profissional escolhido", () => {
    const ocupados = [{ profissional: "ana", inicio: sp("2026-10-09", "09:00"), fim: sp("2026-10-09", "10:00") }];
    const h = horariosDoDia({ agenda: agenda({ ocupados }), profissional: "ana", ...base });
    expect(h).toEqual(["08:00", "08:15", "08:30", "10:00", "10:15", "10:30", "10:45", "11:00", "11:15", "11:30"]);
  });

  it("tanto faz o profissional: basta um estar livre", () => {
    const ocupados = [
      { profissional: "ana", inicio: sp("2026-10-09", "08:00"), fim: sp("2026-10-09", "12:00") },
      { profissional: "bia", inicio: sp("2026-10-09", "08:00"), fim: sp("2026-10-09", "11:00") },
    ];
    expect(horariosDoDia({ agenda: agenda({ ocupados }), profissional: null, ...base })).toEqual(["11:00", "11:15", "11:30"]);
    expect(horariosDoDia({ agenda: agenda({ ocupados }), profissional: "ana", ...base })).toEqual([]);
  });

  it("serviço longo só aparece onde cabe inteiro", () => {
    const ocupados = [{ profissional: "ana", inicio: sp("2026-10-09", "10:00"), fim: sp("2026-10-09", "10:30") }];
    const h = horariosDoDia({ agenda: agenda({ ocupados }), profissional: "ana", ...base, duracao: 90 });
    expect(h).toEqual(["08:00", "08:15", "08:30", "10:30"]);
  });

  it("hoje: esconde o que já passou e o que está em cima da hora", () => {
    const h = horariosDoDia({ agenda: agenda(), profissional: "ana", dia: "2026-10-08", duracao: 30, agoraIso: sp("2026-10-08", "09:10") });
    // 09:10 + 1h de antecedência = 10:10 → primeiro horário é 10:15
    expect(h[0]).toBe("10:15");
  });

  it("antecedência longa invade o dia seguinte", () => {
    const a = agenda({ horario: { ...horario, antecedencia_horas: 24 } });
    const h = horariosDoDia({ agenda: a, profissional: "ana", dia: "2026-10-09", duracao: 30, agoraIso: sp("2026-10-08", "10:00") });
    expect(h[0]).toBe("10:00");
  });

  it("dia sem atendimento ou data fechada não tem horário", () => {
    expect(horariosDoDia({ agenda: agenda(), profissional: null, ...base, dia: "2026-10-11" })).toEqual([]);
    const fechado = agenda({ horario: { ...horario, datas_fechadas: ["2026-10-09"] } });
    expect(horariosDoDia({ agenda: fechado, profissional: null, ...base })).toEqual([]);
  });

  it("sem profissional ativo não há horário", () => {
    expect(horariosDoDia({ agenda: agenda({ profissionais: [] }), profissional: null, ...base })).toEqual([]);
  });
});

describe("primeiro dia com horário", () => {
  it("pula o dia lotado", () => {
    const ocupados = [
      { profissional: "ana", inicio: sp("2026-10-08", "08:00"), fim: sp("2026-10-08", "12:00") },
      { profissional: "bia", inicio: sp("2026-10-08", "08:00"), fim: sp("2026-10-08", "12:00") },
    ];
    const r = primeiroDiaComHorario({ agenda: agenda({ ocupados }), hoje: "2026-10-08", duracao: 30, profissional: null, agoraIso: sp("2026-10-08", "06:00") });
    expect(r).toBe("2026-10-09");
  });

  it("devolve null quando não sobra nada", () => {
    const a = agenda({ horario: { ...horario, dias: [] } });
    expect(primeiroDiaComHorario({ agenda: a, hoje: "2026-10-08", duracao: 30, profissional: null, agoraIso: sp("2026-10-08", "06:00") })).toBeNull();
  });
});

describe("rótulo do dia", () => {
  it("mostra dia da semana, dia e mês", () => {
    expect(rotuloDoDia("2026-10-09")).toEqual({ semana: "sexta", dia: "09", mes: "out" });
    expect(rotuloDoDia("2026-01-04")).toEqual({ semana: "domingo", dia: "04", mes: "jan" });
  });
});
