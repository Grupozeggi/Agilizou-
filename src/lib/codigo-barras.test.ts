import { describe, expect, it } from "vitest";
import {
  modulosCode128,
  modulosCodigo,
  codigoBarrasInterno,
  digitoGtin,
  ehCodigoInterno,
  gtinValido,
  modulosEan,
  normalizarCodigo,
  validarCodigoInformado,
} from "./codigo-barras";

describe("dígito verificador GTIN", () => {
  it("bate com códigos reais conhecidos", () => {
    expect(digitoGtin("400638133393")).toBe(1); // EAN-13 4006381333931
    expect(digitoGtin("9638507")).toBe(4); // EAN-8 96385074
    expect(digitoGtin("03600029145")).toBe(2); // UPC-A 036000291452
  });

  it("valida e recusa", () => {
    expect(gtinValido("4006381333931")).toBe(true);
    expect(gtinValido("4006381333932")).toBe(false);
    expect(gtinValido("96385074")).toBe(true);
    expect(gtinValido("12345")).toBe(false);
  });
});

describe("código interno", () => {
  it("gera EAN-13 começando com 20 e com dígito correto", () => {
    expect(codigoBarrasInterno(1)).toBe("2000000000015");
    expect(codigoBarrasInterno(1234)).toBe("2000000012346");
    for (const n of [1, 7, 99, 1234, 9_999_999_999]) {
      const c = codigoBarrasInterno(n);
      expect(c).toHaveLength(13);
      expect(gtinValido(c)).toBe(true);
      expect(ehCodigoInterno(c)).toBe(true);
    }
  });

  it("códigos diferentes para produtos diferentes", () => {
    const codigos = new Set(Array.from({ length: 500 }, (_, i) => codigoBarrasInterno(i + 1)));
    expect(codigos.size).toBe(500);
  });

  it("código de embalagem não é interno", () => {
    expect(ehCodigoInterno("7891000315507")).toBe(false);
  });

  it("recusa número de produto inválido", () => {
    expect(() => codigoBarrasInterno(0)).toThrow();
    expect(() => codigoBarrasInterno(1.5)).toThrow();
  });
});

describe("código informado no cadastro", () => {
  it("limpa o que o leitor digitou", () => {
    expect(normalizarCodigo(" 4006381333931\n")).toBe("4006381333931");
  });

  it("aceita EAN válido e código alfanumérico", () => {
    expect(validarCodigoInformado("4006381333931")).toEqual({ ok: true, codigo: "4006381333931" });
    expect(validarCodigoInformado("PEC-0042")).toEqual({ ok: true, codigo: "PEC-0042" });
  });

  it("pega erro de digitação no EAN", () => {
    expect(validarCodigoInformado("4006381333932")).toMatchObject({ ok: false });
    expect(validarCodigoInformado("")).toMatchObject({ ok: false });
    expect(validarCodigoInformado("código com espaço/barra")).toMatchObject({ ok: false });
  });
});

describe("desenho EAN", () => {
  it("EAN-13 tem 95 módulos com as guardas no lugar", () => {
    const m = modulosEan("4006381333931")!;
    expect(m).toHaveLength(95);
    expect(m.slice(0, 3)).toBe("101");
    expect(m.slice(45, 50)).toBe("01010");
    expect(m.slice(-3)).toBe("101");
    // 4 → paridade LGLLGG; primeiro dígito da esquerda (0) em L = 0001101
    expect(m.slice(3, 10)).toBe("0001101");
    // segundo dígito (0) em G = 0100111
    expect(m.slice(10, 17)).toBe("0100111");
  });

  it("EAN-8 tem 67 módulos e UPC-A vira EAN-13", () => {
    expect(modulosEan("96385074")).toHaveLength(67);
    expect(modulosEan("036000291452")).toBe(modulosEan("0036000291452"));
  });

  it("código alfanumérico não é desenhado como EAN", () => {
    expect(modulosEan("PEC-0042")).toBeNull();
  });
});

describe("Code 128", () => {
  it("codifica com início B, dígito de controle e parada", () => {
    // "PEC-0042": 8 caracteres → (1 início + 8 + 1 controle) × 11 módulos + parada 13
    const m = modulosCode128("PEC-0042")!;
    expect(m).toHaveLength(10 * 11 + 13);
    expect(m.startsWith("11010010000")).toBe(true); // Start B
    expect(m.endsWith("1100011101011")).toBe(true); // Stop
  });

  it("dígito de controle calculado à mão para 'A'", () => {
    // Start B = 104, 'A' = 33 → (104 + 33×1) mod 103 = 34
    const m = modulosCode128("A")!;
    expect(m.slice(11, 22)).toBe("10100011000"); // símbolo 33 ('A')
    expect(m.slice(22, 33)).toBe("10001011000"); // símbolo 34 (controle)
  });

  it("escolhe EAN quando dá e Code 128 para o resto", () => {
    expect(modulosCodigo("4006381333931")?.tipo).toBe("ean");
    expect(modulosCodigo("PEC-0042")?.tipo).toBe("code128");
    expect(modulosCodigo("ção")).toBeNull();
  });
});
