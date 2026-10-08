import { describe, expect, it } from "vitest";
import { errosPorCampo, esquemaCadastro, esquemaRedefinir } from "./validacao";

describe("validação do cadastro", () => {
  const valido = { nome: "Zé", nome_empresa: "Oficina do Zé", email: " ZE@Oficina.com ", senha: "senha123", aceite: "on" };

  it("aceita dados válidos e normaliza o e-mail", () => {
    const r = esquemaCadastro.safeParse(valido);
    expect(r.success && r.data.email).toBe("ze@oficina.com");
  });

  it("explica cada erro em português", () => {
    const r = esquemaCadastro.safeParse({ ...valido, email: "ze", senha: "curta", aceite: undefined });
    expect(r.success).toBe(false);
    const erros = errosPorCampo(r.error!);
    expect(erros.email).toBe("Digite um e-mail válido.");
    expect(erros.senha).toBe("A senha precisa ter pelo menos 8 caracteres.");
    expect(erros.aceite).toMatch(/Termos de Uso/);
  });

  it("confirmação de senha precisa ser igual", () => {
    const r = esquemaRedefinir.safeParse({ senha: "senha123", confirmacao: "senha124" });
    expect(errosPorCampo(r.error!).confirmacao).toBe("As senhas não são iguais.");
  });
});
