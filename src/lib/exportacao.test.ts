import { describe, expect, it } from "vitest";
import { centavosCsv, gerarCsv } from "./csv";
import { gerarPdf, larguraTexto, textoPdf } from "./pdf";

describe("CSV", () => {
  it("BOM, ponto e vírgula e aspas quando precisa", () => {
    const csv = gerarCsv(["Item", "Total"], [["Óleo; 5W30", "1234,56"], ['Pneu "aro 14"', "-9,90"]]);
    expect(csv).toBe('\uFEFFItem;Total\r\n"Óleo; 5W30";1234,56\r\n"Pneu ""aro 14""";-9,90\r\n');
  });
  it("centavos em número brasileiro", () => {
    expect(centavosCsv(123456)).toBe("1234,56");
    expect(centavosCsv(5)).toBe("0,05");
    expect(centavosCsv(-990)).toBe("-9,90");
  });
});

describe("PDF", () => {
  it("escapa parênteses e codifica acentos em WinAnsi", () => {
    expect(textoPdf("Lucro (mês) – ção\\")).toBe("(Lucro \\(m\xEAs\\) \x96 \xE7\xE3o\\\\)");
    expect(textoPdf("(−) Custos")).toBe("(\\(-\\) Custos)");
  });

  it("gera um PDF válido com várias páginas", () => {
    const linhas = Array.from({ length: 120 }, (_, i) => [`Produto ${i + 1} com nome bem comprido para testar o corte`, "R$ 1.234,56"]);
    const pdf = gerarPdf({
      titulo: "Mais vendidos",
      subtitulo: "Outubro de 2026",
      secoes: [{ titulo: "Itens", colunas: [{ rotulo: "Item", largura: 0.7 }, { rotulo: "Total", largura: 0.3, direita: true }], linhas, total: ["Total", "R$ 9,99"] }],
    });
    const txt = Buffer.from(pdf).toString("latin1");
    expect(txt.startsWith("%PDF-1.4")).toBe(true);
    expect(txt.trimEnd().endsWith("%%EOF")).toBe(true);
    const paginas = (txt.match(/\/Type \/Page /g) ?? []).length;
    expect(paginas).toBeGreaterThan(1);
    expect(txt).toContain(`página ${paginas} de ${paginas}`.replace("á", "\xE1"));
    // xref aponta para o início de cada objeto
    const xref = Number(/startxref\n(\d+)/.exec(txt)![1]);
    const entradas = txt.slice(xref).split("\n").slice(3, 6);
    for (const [i, e] of entradas.entries()) {
      const off = Number(e.slice(0, 10));
      expect(txt.slice(off, off + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`));
    }
  });

  it("mede o texto (Helvetica)", () => {
    expect(larguraTexto("AAAA", 10)).toBeCloseTo(26.68, 1);
    expect(larguraTexto("ção", 10)).toBe(larguraTexto("cao", 10));
  });
});
