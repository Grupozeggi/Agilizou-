"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Aviso, Botao, Campo, Cartao } from "@/components/ui";
import { recuperarSenha } from "../acoes";

export function FormRecuperar() {
  const [estado, acao, enviando] = useActionState(recuperarSenha, {});

  return (
    <Cartao>
      <h1 className="text-2xl">Esqueci minha senha</h1>
      <p className="mt-1 text-suave">Digite seu e-mail e enviamos um link para você criar uma nova.</p>

      {estado.sucesso ? (
        <div className="mt-6">
          <Aviso tipo="sucesso">{estado.sucesso}</Aviso>
        </div>
      ) : (
        <form action={acao} className="mt-6 space-y-4" noValidate>
          {estado.erro && <Aviso>{estado.erro}</Aviso>}
          <Campo
            rotulo="E-mail"
            nome="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            defaultValue={estado.valores?.email}
            erro={estado.erros?.email}
            required
          />
          <Botao type="submit" disabled={enviando}>
            {enviando ? "Enviando..." : "Enviar link"}
          </Botao>
        </form>
      )}

      <p className="mt-6 text-center text-sm">
        <Link href="/entrar" className="font-semibold text-royal-vivo hover:underline">
          Voltar para o login
        </Link>
      </p>
    </Cartao>
  );
}
