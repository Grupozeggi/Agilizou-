import { describe, expect, it } from "vitest";
import { interpretarResposta, lerRegua, limparParametro, planejarEnvios, REGUA_PADRAO } from "./regua";

const atendimento = "2026-10-20T17:00:00.000Z"; // 20/10 14:00 em SP

describe("régua de mensagens", () => {
  it("agendado com antecedência: as 4 mensagens nos horários certos", () => {
    const e = planejarEnvios(atendimento, "2026-10-08T12:00:00.000Z", REGUA_PADRAO);
    expect(e).toEqual([
      { etapa: "5d", agendado_para: "2026-10-15T12:00:00.000Z" }, // 15/10 09:00 SP
      { etapa: "2d", agendado_para: "2026-10-18T12:00:00.000Z" },
      { etapa: "1d", agendado_para: "2026-10-19T12:00:00.000Z" },
      { etapa: "dia", agendado_para: "2026-10-20T11:00:00.000Z" }, // 20/10 08:00 SP
    ]);
  });

  it("agendado com menos de 5 dias: só o que ainda faz sentido", () => {
    const e = planejarEnvios(atendimento, "2026-10-18T15:00:00.000Z", REGUA_PADRAO);
    expect(e.map((x) => x.etapa)).toEqual(["1d", "dia"]);
  });

  it("atendimento cedo: mensagem do dia até 1h antes, senão 2h antes; muito cedo: não envia", () => {
    const as09 = planejarEnvios("2026-10-20T12:00:00.000Z", "2026-10-08T12:00:00.000Z", REGUA_PADRAO); // 09:00 SP
    expect(as09.find((x) => x.etapa === "dia")?.agendado_para).toBe("2026-10-20T11:00:00.000Z"); // 08:00 SP
    const as1000 = planejarEnvios("2026-10-20T13:00:00.000Z", "2026-10-08T12:00:00.000Z", REGUA_PADRAO); // 10:00 SP
    expect(as1000.find((x) => x.etapa === "dia")?.agendado_para).toBe("2026-10-20T11:00:00.000Z"); // 08:00 SP
    // 08:30: 8h seria só 30 min antes; 2h antes seria 06:30 (cedo demais) → não envia

    const as0830 = planejarEnvios("2026-10-20T11:30:00.000Z", "2026-10-08T12:00:00.000Z", REGUA_PADRAO); // 08:30 SP
    expect(as0830.some((x) => x.etapa === "dia")).toBe(false);
  });

  it("respeita etapas desligadas", () => {
    const regua = lerRegua([{ etapa: "5d", ativo: false }, { etapa: "2d", ativo: false }]);
    expect(planejarEnvios(atendimento, "2026-10-08T12:00:00.000Z", regua).map((x) => x.etapa)).toEqual(["1d", "dia"]);
  });

  it("lerRegua volta ao padrão quando o dado é inválido", () => {
    expect(lerRegua(null)).toEqual(REGUA_PADRAO);
    expect(lerRegua([{ etapa: "1d", modelo: "  " }])[2].modelo).toBe(REGUA_PADRAO[2].modelo);
  });
});

describe("respostas do cliente", () => {
  it.each([
    ["1", "confirmar"],
    ["Confirmo", "confirmar"],
    [" sim ", "confirmar"],
    ["2", "remarcar"],
    ["reagendar", "remarcar"],
    ["3", "cancelar"],
    ["Cancelar", "cancelar"],
    ["não vou", "cancelar"],
    ["oi, que horas?", null],
  ])("%j → %s", (texto, esperado) => {
    expect(interpretarResposta(texto)).toBe(esperado);
  });
});

describe("parâmetro de template", () => {
  it("remove quebras de linha e espaços em excesso", () => {
    expect(limparParametro("Oi\nAna      tudo bem?\t")).toBe("Oi Ana   tudo bem?");
  });
});
