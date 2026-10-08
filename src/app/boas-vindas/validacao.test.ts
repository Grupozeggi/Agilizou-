import { describe, expect, it } from "vitest";
import { esquemaOnboarding } from "./validacao";

describe("validação do onboarding", () => {
  it("converte o saldo para centavos", () => {
    const r = esquemaOnboarding.parse({ nome: " Oficina do Zé ", nicho: "mecanica", saldo: "1.500,00" });
    expect(r).toEqual({ nome: "Oficina do Zé", nicho: "mecanica", saldo: 150000 });
  });

  it("aceita saldo negativo e zero", () => {
    expect(esquemaOnboarding.parse({ nome: "Loja", nicho: "varejo", saldo: "-250,90" }).saldo).toBe(-25090);
    expect(esquemaOnboarding.parse({ nome: "Loja", nicho: "varejo", saldo: "0,00" }).saldo).toBe(0);
  });

  it("recusa nicho desconhecido, nome vazio e saldo inválido", () => {
    const r = esquemaOnboarding.safeParse({ nome: " ", nicho: "padaria", saldo: "abc" });
    expect(r.success).toBe(false);
    const campos = r.error!.issues.map((i) => i.path[0]);
    expect(campos).toEqual(expect.arrayContaining(["nome", "nicho", "saldo"]));
  });
});
