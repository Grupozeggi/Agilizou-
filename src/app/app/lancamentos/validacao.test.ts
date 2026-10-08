import { describe, expect, it } from "vitest";
import { esquemaEditarLancamento, esquemaNovoLancamento } from "./validacao";

const CAT = "3f0c8a8e-7d3c-4b8e-9a51-0b6a2a1f7c11";
const base = { tipo: "saida", valor: "1.500,00", categoria_id: CAT, data: "2026-10-08", pago: "on" };

describe("validação do lançamento", () => {
  it("entrada simples, paga hoje", () => {
    const r = esquemaNovoLancamento.parse({ ...base, tipo: "entrada", forma_pagamento: "pix", descricao: "  Revisão  " });
    expect(r).toMatchObject({ tipo: "entrada", valor: 150000, pago: true, forma_pagamento: "pix", descricao: "Revisão", repeticao: "nao" });
  });

  it("checkbox desmarcado = pendente; campos vazios viram undefined", () => {
    const r = esquemaNovoLancamento.parse({ ...base, pago: undefined, forma_pagamento: "", observacao: "" });
    expect(r.pago).toBe(false);
    expect(r.forma_pagamento).toBeUndefined();
    expect(r.observacao).toBeUndefined();
  });

  it("aceita data dd/mm/aaaa e recusa data inexistente", () => {
    expect(esquemaNovoLancamento.parse({ ...base, data: "08/10/2026" }).data).toBe("2026-10-08");
    expect(esquemaNovoLancamento.safeParse({ ...base, data: "2026-02-30" }).success).toBe(false);
  });

  it("valor precisa ser maior que zero", () => {
    for (const valor of ["0,00", "-10", "abc", ""]) {
      expect(esquemaNovoLancamento.safeParse({ ...base, valor }).success).toBe(false);
    }
  });

  it("parcelado exige de 2 a 48 vezes e valor divisível", () => {
    expect(esquemaNovoLancamento.parse({ ...base, repeticao: "parcelado", vezes: "10" }).vezes).toBe(10);
    expect(esquemaNovoLancamento.safeParse({ ...base, repeticao: "parcelado", vezes: "1" }).success).toBe(false);
    expect(esquemaNovoLancamento.safeParse({ ...base, repeticao: "parcelado", vezes: "49" }).success).toBe(false);
    expect(esquemaNovoLancamento.safeParse({ ...base, valor: "0,05", repeticao: "parcelado", vezes: "10" }).success).toBe(false);
  });

  it("recorrente vai até 60 meses", () => {
    expect(esquemaNovoLancamento.safeParse({ ...base, repeticao: "recorrente", vezes: "60" }).success).toBe(true);
    expect(esquemaNovoLancamento.safeParse({ ...base, repeticao: "recorrente", vezes: "61" }).success).toBe(false);
  });

  it("forma de pagamento desconhecida é recusada", () => {
    expect(esquemaNovoLancamento.safeParse({ ...base, forma_pagamento: "cheque" }).success).toBe(false);
  });

  it("edição usa escopo 'este' por padrão", () => {
    expect(esquemaEditarLancamento.parse({ ...base, id: CAT }).escopo).toBe("este");
  });
});
