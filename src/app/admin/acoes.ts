"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PLANOS, type Limites } from "@/config/planos";
import { urlDoSite } from "@/lib/env";
import type { EstadoForm } from "@/lib/formulario";
import { exigirAdmin } from "@/lib/sessao";
import { criarClienteServico } from "@/lib/supabase/servico";
import { COOKIE_SUPORTE, empresaDoCookie } from "@/lib/suporte";

// As alterações feitas com o cliente do admin (JWT + 2FA) passam pela RLS e
// são registradas em log_admin pelo gatilho do banco. Ações que não alteram
// tabelas de negócio (entrar no suporte, redefinir senha) são registradas aqui.

const id = z.uuid();

async function registrar(acao: string, empresaId: string, extra: Record<string, unknown> = {}) {
  const { claims } = await exigirAdmin();
  await criarClienteServico().from("log_admin").insert({
    admin_id: claims.sub,
    admin_email: claims.email,
    empresa_id: empresaId,
    acao,
    valor_novo: Object.keys(extra).length ? extra : null,
  });
}

export async function entrarModoSuporte(empresaId: string) {
  if (!id.safeParse(empresaId).success) return;
  const { supabase } = await exigirAdmin();
  const { data } = await supabase.from("empresas").select("id").eq("id", empresaId).maybeSingle();
  if (!data) return;
  await registrar("entrar_modo_suporte", empresaId);
  (await cookies()).set(COOKIE_SUPORTE, empresaId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 2 * 60 * 60, // 2 horas
  });
  redirect("/app");
}

export async function sairModoSuporte() {
  const loja = await cookies();
  const empresa = empresaDoCookie(loja.get(COOKIE_SUPORTE)?.value);
  loja.delete(COOKIE_SUPORTE);
  if (empresa) {
    await registrar("sair_modo_suporte", empresa);
    redirect(`/admin/empresas/${empresa}`);
  }
  redirect("/admin");
}

const esquemaConta = z.object({
  empresa: id,
  acao: z.enum(["plano", "estender", "suspender", "reativar"]),
  plano: z.enum(["essencial", "profissional"]).optional(),
  dias: z.coerce.number().int().min(1).max(365).optional(),
});

export async function alterarConta(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const r = esquemaConta.safeParse(Object.fromEntries(form));
  if (!r.success) return { erro: "Dados inválidos." };
  const { supabase } = await exigirAdmin();
  const { empresa, acao } = r.data;
  const { data: atual } = await supabase.from("empresas").select("teste_ate, asaas_assinatura_id").eq("id", empresa).single();
  if (!atual) return { erro: "Empresa não encontrada." };

  let dados: Record<string, unknown>;
  let msg: string;
  if (acao === "plano") {
    if (!r.data.plano) return { erro: "Escolha o plano." };
    dados = { plano: r.data.plano, plano_proximo: null };
    msg = `Plano alterado para ${PLANOS[r.data.plano].nome}.`;
  } else if (acao === "estender") {
    const dias = r.data.dias ?? 7;
    const base = Math.max(Date.now(), new Date(atual.teste_ate).getTime());
    dados = { status_assinatura: "teste", teste_ate: new Date(base + dias * 86_400_000).toISOString() };
    msg = `Teste estendido em ${dias} dias.`;
  } else if (acao === "suspender") {
    dados = { status_assinatura: "suspenso" };
    msg = "Conta suspensa (somente leitura).";
  } else {
    dados = atual.asaas_assinatura_id ? { status_assinatura: "ativo" } : { status_assinatura: "teste", teste_ate: new Date(Date.now() + 7 * 86_400_000).toISOString() };
    msg = "Conta reativada.";
  }
  const { error } = await supabase.from("empresas").update(dados).eq("id", empresa);
  if (error) return { erro: "Não foi possível salvar." };
  revalidatePath(`/admin/empresas/${empresa}`);
  return { sucesso: msg };
}

const CAMPOS_LIMITE: (keyof Limites)[] = ["lancamentosPorMes", "produtos", "clientes", "profissionais", "exportacoesPorMes", "mensagensWhatsappPorMes"];

/** Limites só desta empresa (vazio = usa o do plano). */
export async function salvarLimites(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const empresa = String(form.get("empresa") ?? "");
  if (!id.safeParse(empresa).success) return { erro: "Empresa inválida." };
  const limites: Partial<Limites> = {};
  for (const c of CAMPOS_LIMITE) {
    const v = String(form.get(c) ?? "").trim();
    if (!v) continue;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 1_000_000) return { erros: { [c]: "Use um número inteiro." } };
    limites[c] = n;
  }
  const { supabase } = await exigirAdmin();
  const { error } = await supabase
    .from("empresas")
    .update({ limites_personalizados: Object.keys(limites).length ? limites : null })
    .eq("id", empresa);
  if (error) return { erro: "Não foi possível salvar." };
  revalidatePath(`/admin/empresas/${empresa}`);
  return { sucesso: "Limites salvos." };
}

export async function redefinirSenha(empresaId: string): Promise<EstadoForm> {
  if (!id.safeParse(empresaId).success) return { erro: "Empresa inválida." };
  const { supabase } = await exigirAdmin();
  const { data: perfis } = await supabase.from("perfis").select("email").eq("empresa_id", empresaId);
  if (!perfis?.length) return { erro: "Nenhum usuário nesta empresa." };
  const servico = criarClienteServico();
  for (const p of perfis) {
    const { error } = await servico.auth.resetPasswordForEmail(p.email, { redirectTo: `${urlDoSite()}/auth/confirmar?proximo=/redefinir-senha` });
    if (error) return { erro: `Não foi possível enviar para ${p.email}.` };
  }
  await registrar("redefinir_senha", empresaId, { emails: perfis.map((p) => p.email) });
  return { sucesso: `Link de nova senha enviado para ${perfis.map((p) => p.email).join(", ")}.` };
}

export async function restaurarLancamento(lancamentoId: string, empresaId: string): Promise<EstadoForm> {
  if (!id.safeParse(lancamentoId).success) return { erro: "Lançamento inválido." };
  const { supabase } = await exigirAdmin();
  const { error, count } = await supabase
    .from("lancamentos")
    .update({ deleted_at: null }, { count: "exact" })
    .eq("id", lancamentoId)
    .not("deleted_at", "is", null);
  if (error || !count) return { erro: "Não foi possível restaurar." };
  revalidatePath(`/admin/empresas/${empresaId}`);
  return { sucesso: "Lançamento restaurado." };
}
