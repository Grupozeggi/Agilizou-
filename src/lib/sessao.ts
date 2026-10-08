import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Limites } from "@/config/planos";
import { adminCom2fa, type Claims } from "@/lib/acesso";
import { mensagemSomenteLeitura } from "@/lib/assinatura";
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
  limites_personalizados: Partial<Limites> | null;
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
    .select(
      "id, nome, nicho, plano, status_assinatura, teste_ate, onboarding_concluido, agenda_ativa, limites_personalizados",
    )
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

/**
 * Para ações que gravam: além do usuário e da empresa, devolve `bloqueio`
 * (texto) quando a conta está somente leitura (teste vencido,
 * inadimplente, cancelada). O banco também recusa (RLS), isto só deixa a
 * mensagem clara.
 */
export async function exigirEscrita() {
  const ctx = await exigirCliente();
  return { ...ctx, bloqueio: mensagemSomenteLeitura(ctx.empresa.status_assinatura, ctx.empresa.teste_ate) };
}
