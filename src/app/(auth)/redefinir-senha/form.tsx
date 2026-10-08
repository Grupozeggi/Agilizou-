"use client";

import { useActionState } from "react";
import { Aviso, Botao, Campo, Cartao } from "@/components/ui";
import { redefinirSenha } from "../acoes";
import { Formulario } from "@/components/formulario";

export function FormRedefinir() {
  const [estado, acao, enviando] = useActionState(redefinirSenha, {});

  return (
    <Cartao>
      <h1 className="text-2xl">Criar nova senha</h1>
      <Formulario acao={acao} className="mt-6 space-y-4" noValidate>
        {estado.erro && <Aviso>{estado.erro}</Aviso>}
        <Campo
          rotulo="Nova senha"
          nome="senha"
          type="password"
          autoComplete="new-password"
          ajuda="Pelo menos 8 caracteres, com letras e números."
          erro={estado.erros?.senha}
          required
        />
        <Campo
          rotulo="Repita a nova senha"
          nome="confirmacao"
          type="password"
          autoComplete="new-password"
          erro={estado.erros?.confirmacao}
          required
        />
        <Botao type="submit" disabled={enviando}>
          {enviando ? "Salvando..." : "Salvar nova senha"}
        </Botao>
      </Formulario>
    </Cartao>
  );
}
