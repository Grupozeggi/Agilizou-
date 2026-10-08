import { describe, expect, it } from "vitest";
import { formatarWhatsapp, linkWhatsapp, MODELO_COBRANCA, normalizarWhatsapp, preencher } from "./mensagens";

describe("WhatsApp", () => {
  it("normaliza números brasileiros", () => {
    expect(normalizarWhatsapp("(11) 99999-8888")).toBe("5511999998888");
    expect(normalizarWhatsapp("+55 11 99999-8888")).toBe("5511999998888");
    expect(normalizarWhatsapp("1133334444")).toBe("551133334444");
    expect(normalizarWhatsapp("0055 21 98888-7777")).toBe("5521988887777");
  });

  it("recusa números inválidos", () => {
    for (const n of ["", "123", "(01) 99999-8888", "abc", null]) expect(normalizarWhatsapp(n)).toBeNull();
  });

  it("formata para exibir", () => {
    expect(formatarWhatsapp("5511999998888")).toBe("(11) 99999-8888");
  });

  it("monta o link com a mensagem codificada", () => {
    expect(linkWhatsapp("5511999998888", "Oi, tudo bem?")).toBe("https://wa.me/5511999998888?text=Oi%2C%20tudo%20bem%3F");
    expect(linkWhatsapp(null, "Oi")).toBe("https://wa.me/?text=Oi");
  });

  it("preenche variáveis do modelo", () => {
    const t = preencher(MODELO_COBRANCA, { nome: "Carlos", valor: "R$ 150,00", data: "10/10/2026", empresa: "Oficina do Zé" });
    expect(t).toBe(
      "Oi, Carlos, tudo bem? Passando para lembrar do pagamento de R$ 150,00, com vencimento em 10/10/2026. Se já pagou, desconsidere. Obrigado! Oficina do Zé",
    );
    expect(preencher("Oi {nome} {desconhecida}", { nome: "Ana" })).toBe("Oi Ana {desconhecida}");
  });
});
