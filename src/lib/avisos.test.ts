import { describe, expect, it } from "vitest";
import { datasDeAviso, escaparHtml, montarAviso } from "./avisos";

describe("avisos de vencimento", () => {
  it("no dia e 1 dia antes (padrão)", () => {
    expect(datasDeAviso("2026-10-08", { aviso_no_dia: true, aviso_dias_antes: 1 })).toEqual(["2026-10-08", "2026-10-09"]);
  });
  it("configurável: só 3 dias antes, ou nada", () => {
    expect(datasDeAviso("2026-10-08", { aviso_no_dia: false, aviso_dias_antes: 3 })).toEqual(["2026-10-11"]);
    expect(datasDeAviso("2026-10-08", { aviso_no_dia: false, aviso_dias_antes: 0 })).toEqual([]);
  });

  it("monta título e linhas", () => {
    const a = montarAviso(
      [
        { tipo: "pagar", titulo: "Aluguel", data: "2026-10-08", valor_centavos: 150000 },
        { tipo: "receber", titulo: "Carlos", data: "2026-10-09", valor_centavos: 25000 },
        { tipo: "lembrete", titulo: "Ligar para o contador", data: "2026-10-08", valor_centavos: null },
      ],
      "2026-10-08",
      "Oficina do Zé",
    );
    expect(a.titulo).toBe("Oficina do Zé: 2 avisos para hoje");
    expect(a.linhas).toEqual([
      "Pagar: Aluguel (hoje) · R$ 1.500,00",
      "Lembrete: Ligar para o contador (hoje)",
      "Receber: Carlos (09/10/2026) · R$ 250,00",
    ]);
  });

  it("escapa HTML", () => {
    expect(escaparHtml(`<b>"Zé" & cia</b>`)).toBe("&lt;b&gt;&quot;Zé&quot; &amp; cia&lt;/b&gt;");
  });
});
