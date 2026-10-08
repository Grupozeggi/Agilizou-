import { describe, expect, it } from "vitest";
import { LISTA_NICHOS, NICHOS, nichoValido } from "./nichos";

describe("templates de nicho", () => {
  it.each(LISTA_NICHOS.map((n) => [n.id, n] as const))("%s tem categorias consistentes", (_, nicho) => {
    const entradas = nicho.categorias.filter((c) => c.tipo === "entrada");
    const saidas = nicho.categorias.filter((c) => c.tipo === "saida");
    expect(entradas.length).toBeGreaterThan(0);
    expect(saidas.length).toBeGreaterThan(0);
    // mesmas regras do banco: entrada é receita; saída é custo ou despesa
    expect(entradas.every((c) => c.grupo === "receita")).toBe(true);
    expect(saidas.every((c) => c.grupo === "custo" || c.grupo === "despesa")).toBe(true);
    // sem nome repetido dentro do mesmo tipo
    for (const lista of [entradas, saidas]) {
      expect(new Set(lista.map((c) => c.nome)).size).toBe(lista.length);
    }
  });

  it("segue os exemplos do produto", () => {
    const nomes = (id: keyof typeof NICHOS, tipo: string) =>
      NICHOS[id].categorias.filter((c) => c.tipo === tipo).map((c) => c.nome);
    expect(nomes("mecanica", "entrada")).toEqual(expect.arrayContaining(["Serviço", "Peça"]));
    expect(nomes("mecanica", "saida")).toEqual(expect.arrayContaining(["Peças", "Aluguel", "Ferramentas", "Funcionário"]));
    expect(nomes("odontologia", "entrada")).toEqual(expect.arrayContaining(["Consulta", "Procedimento", "Ortodontia"]));
    expect(nomes("odontologia", "saida")).toEqual(
      expect.arrayContaining(["Material", "Laboratório", "Repasse a dentista", "Aluguel"]),
    );
  });

  it("agenda ligada para serviços e desligada para mecânica e varejo", () => {
    expect(NICHOS.salao.agendaAtiva).toBe(true);
    expect(NICHOS.odontologia.agendaAtiva).toBe(true);
    expect(NICHOS.outro.agendaAtiva).toBe(true);
    expect(NICHOS.mecanica.agendaAtiva).toBe(false);
    expect(NICHOS.varejo.agendaAtiva).toBe(false);
  });

  it("valida o id do nicho", () => {
    expect(nichoValido("salao")).toBe(true);
    expect(nichoValido("toString")).toBe(false);
    expect(nichoValido("padaria")).toBe(false);
  });
});
