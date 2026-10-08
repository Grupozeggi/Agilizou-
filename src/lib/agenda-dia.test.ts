import { describe, expect, it } from "vitest";
import { montarAgenda, type ItemAgenda } from "./agenda-dia";

const item = (id: string, tipo: ItemAgenda["tipo"], data: string, hora?: string): ItemAgenda => ({ id, tipo, data, hora, titulo: id });

describe("agenda do dia", () => {
  const hoje = "2026-10-08";
  const itens = [
    item("aluguel", "pagar", "2026-10-05"),
    item("fulano", "receber", "2026-10-08"),
    item("lembrete", "lembrete", "2026-10-08"),
    item("corte-15h", "atendimento", "2026-10-08", "15:00"),
    item("corte-09h", "atendimento", "2026-10-08", "09:00"),
    item("luz", "pagar", "2026-10-10"),
    item("fora", "pagar", "2026-10-20"),
    item("atendimento-passado", "atendimento", "2026-10-07", "10:00"),
  ];

  it("dia: atrasados no topo e hoje em ordem (atendimentos por hora primeiro)", () => {
    const a = montarAgenda(itens, hoje, 1);
    expect(a.atrasados.map((i) => i.id)).toEqual(["aluguel"]);
    expect(a.porDia[0].itens.map((i) => i.id)).toEqual(["corte-09h", "corte-15h", "fulano", "lembrete"]);
    expect(a.total).toBe(5);
  });

  it("semana: 7 dias a partir de hoje, sem o que está fora", () => {
    const a = montarAgenda(itens, hoje, 7);
    expect(a.porDia).toHaveLength(7);
    expect(a.fim).toBe("2026-10-14");
    expect(a.porDia[2].itens.map((i) => i.id)).toEqual(["luz"]);
    expect(a.porDia.flatMap((d) => d.itens).some((i) => i.id === "fora")).toBe(false);
  });

  it("atendimento que já passou não vira atrasado", () => {
    expect(montarAgenda(itens, hoje, 1).atrasados.some((i) => i.tipo === "atendimento")).toBe(false);
  });
});
