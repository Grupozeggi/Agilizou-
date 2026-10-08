"use server";

import { redirect } from "next/navigation";
import { caminhoSeguro, temPapelAdmin, type Claims } from "@/lib/acesso";
import { urlDoSite } from "@/lib/env";
import { mensagemDeErroAuth } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import {
  errosPorCampo,
  esquemaCadastro,
  esquemaEntrar,
  esquemaRecuperar,
  esquemaRedefinir,
  type EstadoForm,
} from "./validacao";

const texto = (f: FormData, campo: string) => {
  const v = f.get(campo);
  return typeof v === "string" ? v : undefined;
};

export async function cadastrar(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const dados = {
    nome: texto(form, "nome"),
    nome_empresa: texto(form, "nome_empresa"),
    email: texto(form, "email"),
    senha: texto(form, "senha"),
    aceite: texto(form, "aceite"),
  };
  const valores = { nome: dados.nome ?? "", nome_empresa: dados.nome_empresa ?? "", email: dados.email ?? "" };

  const r = esquemaCadastro.safeParse(dados);
  if (!r.success) return { erros: errosPorCampo(r.error), valores };

  const supabase = await criarClienteServidor();
  // Os metadados vão em user_metadata (editável pelo usuário) e servem só
  // para nomear a empresa. O papel de admin NUNCA vem daqui.
  const { data, error } = await supabase.auth.signUp({
    email: r.data.email,
    password: r.data.senha,
    options: {
      data: { nome: r.data.nome, nome_empresa: r.data.nome_empresa },
      emailRedirectTo: `${urlDoSite()}/auth/confirmar?proximo=/app`,
    },
  });
  if (error) return { erro: mensagemDeErroAuth(error), valores };

  // Confirmação de e-mail desligada no Supabase (comum em testes): já entra.
  if (data.session) redirect("/boas-vindas");

  return {
    sucesso: `Pronto! Enviamos um link de confirmação para ${r.data.email}. Abra o e-mail para ativar seu teste grátis de 7 dias.`,
  };
}

export async function entrar(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const r = esquemaEntrar.safeParse({ email: texto(form, "email"), senha: texto(form, "senha") });
  const valores = { email: texto(form, "email") ?? "" };
  if (!r.success) return { erros: errosPorCampo(r.error), valores };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email: r.data.email, password: r.data.senha });
  if (error) return { erro: mensagemDeErroAuth(error), valores };

  const { data } = await supabase.auth.getClaims();
  if (temPapelAdmin(data?.claims as Claims | undefined)) redirect("/admin/verificacao");
  redirect(caminhoSeguro(texto(form, "proximo")));
}

export async function recuperarSenha(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const r = esquemaRecuperar.safeParse({ email: texto(form, "email") });
  if (!r.success) return { erros: errosPorCampo(r.error), valores: { email: texto(form, "email") ?? "" } };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.resetPasswordForEmail(r.data.email, {
    redirectTo: `${urlDoSite()}/auth/confirmar?proximo=/redefinir-senha`,
  });
  // Limite de envio é o único erro que vale mostrar. Nos demais casos a
  // resposta é sempre a mesma, para não revelar quais e-mails têm conta.
  if (error && /rate/i.test(error.code ?? error.message)) return { erro: mensagemDeErroAuth(error) };

  return {
    sucesso: "Se existir uma conta com este e-mail, você vai receber um link para criar uma nova senha em alguns minutos.",
  };
}

export async function redefinirSenha(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const r = esquemaRedefinir.safeParse({ senha: texto(form, "senha"), confirmacao: texto(form, "confirmacao") });
  if (!r.success) return { erros: errosPorCampo(r.error) };

  const supabase = await criarClienteServidor();
  const { data: sessao } = await supabase.auth.getClaims();
  if (!sessao?.claims) {
    return { erro: "Seu link expirou. Peça um novo em \"Esqueci minha senha\"." };
  }

  const { error } = await supabase.auth.updateUser({ password: r.data.senha });
  if (error) return { erro: mensagemDeErroAuth(error) };

  redirect(temPapelAdmin(sessao.claims as Claims) ? "/admin" : "/app");
}

export async function sair() {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  redirect("/entrar");
}
