import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { adminCom2fa, type Claims } from "@/lib/acesso";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/**
 * Camada de acesso (DAL): toda página/ação lê o usuário por aqui.
 * O proxy já barra quem não pode entrar, mas checamos de novo no servidor
 * (defesa em profundidade) e a RLS do banco é a proteção final.
 */

export type Empresa = {
  id: string;
  nome: string;
  nicho: string;
  plano: "essencial" | "profissional";
  status_assinatura: "teste" | "ativo" | "inadimplente" | "cancelado" | "suspenso";
  teste_ate: string;
  onboarding_concluido: boolean;
  agenda_ativa: boolean;
};

export const obterClaims = cache(async (): Promise<Claims | null> => {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getClaims();
  return (data?.claims as Claims | undefined) ?? null;
});

/** Usuário cliente logado + empresa dele. Redireciona para o login se não houver. */
export const exigirCliente = cache(async () => {
  const claims = await obterClaims();
  if (!claims) redirect("/entrar");

  const supabase = await criarClienteServidor();
  const { data: empresa, error } = await supabase
    .from("empresas")
    .select("id, nome, nicho, plano, status_assinatura, teste_ate, onboarding_concluido, agenda_ativa")
    .single<Empresa>();

  if (error || !empresa) {
    // Usuário sem empresa (ex.: admin) não usa a área do cliente.
    redirect("/entrar?erro=conta");
  }
  return { claims, empresa, supabase };
});

/** Admin com 2FA. Qualquer outro vai para a tela de acesso negado. */
export const exigirAdmin = cache(async () => {
  const claims = await obterClaims();
  if (!claims) redirect("/entrar?proximo=/admin");
  if (!adminCom2fa(claims)) redirect("/acesso-negado");
  return { claims, supabase: await criarClienteServidor() };
});
