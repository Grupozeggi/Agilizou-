"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Aviso, Botao, Campo, Cartao } from "@/components/ui";
import { cadastrar } from "../acoes";
import { Formulario } from "@/components/formulario";

export function FormCadastro() {
  const [estado, acao, enviando] = useActionState(cadastrar, {});

  if (estado.sucesso) {
    return (
      <Cartao>
        <h1 className="text-2xl">Confira seu e-mail</h1>
        <div className="mt-4">
          <Aviso tipo="sucesso">{estado.sucesso}</Aviso>
        </div>
        <p className="mt-4 text-sm text-suave">Não chegou? Olhe a caixa de spam ou promoções.</p>
      </Cartao>
    );
  }

  return (
    <Cartao>
      <h1 className="text-2xl">Teste grátis por 7 dias</h1>
      <p className="mt-1 text-suave">Sem cartão. Leva menos de um minuto.</p>

      <Formulario acao={acao} className="mt-6 space-y-4" noValidate>
        {estado.erro && <Aviso>{estado.erro}</Aviso>}
        <Campo
          rotulo="Seu nome"
          nome="nome"
          autoComplete="name"
          defaultValue={estado.valores?.nome}
          erro={estado.erros?.nome}
          required
        />
        <Campo
          rotulo="Nome do negócio"
          nome="nome_empresa"
          autoComplete="organization"
          placeholder="Ex.: Oficina do Zé"
          defaultValue={estado.valores?.nome_empresa}
          erro={estado.erros?.nome_empresa}
          required
        />
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
          autoComplete="new-password"
          ajuda="Pelo menos 8 caracteres, com letras e números."
          erro={estado.erros?.senha}
          required
        />
        <label className="flex items-start gap-3 text-sm text-suave">
          <input name="aceite" type="checkbox" className="mt-0.5 size-5 accent-royal-vivo" required />
          <span>
            Li e aceito os{" "}
            <Link href="/termos" className="font-medium text-royal-vivo underline" target="_blank">
              Termos de Uso
            </Link>{" "}
            e a{" "}
            <Link href="/privacidade" className="font-medium text-royal-vivo underline" target="_blank">
              Política de Privacidade
            </Link>
            .
          </span>
        </label>
        {estado.erros?.aceite && <p className="text-sm text-saida">{estado.erros.aceite}</p>}
        <Botao type="submit" disabled={enviando}>
          {enviando ? "Criando sua conta..." : "Criar conta grátis"}
        </Botao>
      </Formulario>

      <p className="mt-6 text-center text-sm text-suave">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-semibold text-royal-vivo hover:underline">
          Entrar
        </Link>
      </p>
    </Cartao>
  );
}
