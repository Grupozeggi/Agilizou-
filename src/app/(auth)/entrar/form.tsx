"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Aviso, Botao, Campo, Cartao } from "@/components/ui";
import { entrar } from "../acoes";

export function FormEntrar({ proximo, erroLink }: { proximo?: string; erroLink?: boolean }) {
  const [estado, acao, enviando] = useActionState(entrar, {});

  return (
    <Cartao>
      <h1 className="text-2xl">Entrar</h1>
      <p className="mt-1 text-suave">Bom te ver de novo.</p>

      <form action={acao} className="mt-6 space-y-4" noValidate>
        {erroLink && !estado.erro && (
          <Aviso>Este link é inválido ou já expirou. Entre com seu e-mail e senha ou peça um novo link.</Aviso>
        )}
        {estado.erro && <Aviso>{estado.erro}</Aviso>}
        <input type="hidden" name="proximo" value={proximo ?? ""} />
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
        <Campo
          rotulo="Senha"
          nome="senha"
          type="password"
          autoComplete="current-password"
          erro={estado.erros?.senha}
          required
        />
        <div className="text-right">
          <Link href="/recuperar-senha" className="text-sm font-medium text-royal-vivo hover:underline">
            Esqueci minha senha
          </Link>
        </div>
        <Botao type="submit" disabled={enviando}>
          {enviando ? "Entrando..." : "Entrar"}
        </Botao>
      </form>

      <p className="mt-6 text-center text-sm text-suave">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="font-semibold text-royal-vivo hover:underline">
          Teste grátis por 7 dias
        </Link>
      </p>
    </Cartao>
  );
}
