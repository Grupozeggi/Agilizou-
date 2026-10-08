"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PLANOS, type PlanoId } from "@/config/planos";
import { validarCpfCnpj, valorProporcional } from "@/lib/assinatura";
import { dataSp, hojeIso } from "@/lib/datas";
import type { EstadoForm } from "@/lib/formulario";
import { exigirCliente } from "@/lib/sessao";
import { criarClienteServico } from "@/lib/supabase/servico";
import {
  atualizarCliente,
  atualizarValorAssinatura,
  cancelarAssinaturaAsaas,
  cobrancasDaAssinatura,
  criarAssinatura,
  criarCliente,
  criarCobrancaAvulsa,
  ErroAsaas,
} from "@/services/asaas";

// O cliente não altera plano/status direto no banco (gatilho protege); quem
// grava é o servidor com a chave de serviço, depois de falar com o Asaas.

const reais = (centavos: number) => Math.round(centavos) / 100;
const plano = z.enum(["essencial", "profissional"]);

async function dadosAssinatura() {
  const { empresa, claims } = await exigirCliente();
  const db = criarClienteServico();
  const { data } = await db
    .from("empresas")
    .select("id, nome, plano, plano_proximo, status_assinatura, teste_ate, asaas_cliente_id, asaas_assinatura_id, proxima_cobranca, cpf_cnpj")
    .eq("id", empresa.id)
    .single();
  return { e: data!, email: claims.email ?? "", db };
}

function erroAmigavel(e: unknown): EstadoForm {
  console.error("[assinatura]", e);
  if (e instanceof ErroAsaas) return { erro: `Não foi possível falar com o sistema de pagamento: ${e.message}` };
  return { erro: "Não foi possível concluir agora. Tente de novo em instantes." };
}

export async function assinar(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const escolhido = plano.safeParse(form.get("plano"));
  const documento = validarCpfCnpj(String(form.get("cpf_cnpj") ?? ""));
  const nome = String(form.get("nome") ?? "").trim();
  const erros: Record<string, string> = {};
  if (!escolhido.success) erros.plano = "Escolha um plano.";
  if (!documento) erros.cpf_cnpj = "CPF ou CNPJ inválido.";
  if (nome.length < 3) erros.nome = "Digite o nome para a nota da cobrança.";
  if (Object.keys(erros).length) return { erros };

  const { e, email, db } = await dadosAssinatura();
  if (e.asaas_assinatura_id && e.status_assinatura !== "cancelado") return { erro: "Você já tem uma assinatura. Use a troca de plano." };
  let urlPagamento: string | undefined;
  try {
    const cliente = e.asaas_cliente_id
      ? (await atualizarCliente(e.asaas_cliente_id, { name: nome, email, cpfCnpj: documento! }), { id: e.asaas_cliente_id })
      : await criarCliente({ name: nome, email, cpfCnpj: documento!, externalReference: e.id });
    // Ainda no teste: a primeira cobrança vence no fim do teste. Senão, hoje.
    const fimTeste = dataSp(e.teste_ate);
    const vencimento = e.status_assinatura === "teste" && fimTeste > hojeIso() ? fimTeste : hojeIso();
    const p = PLANOS[escolhido.data!];
    const assinatura = await criarAssinatura({
      customer: cliente.id,
      value: reais(p.precoCentavos),
      nextDueDate: vencimento,
      description: `Agilizou ${p.nome}`,
      externalReference: e.id,
    });
    await db
      .from("empresas")
      .update({
        asaas_cliente_id: cliente.id,
        asaas_assinatura_id: assinatura.id,
        plano: p.id,
        plano_proximo: null,
        cpf_cnpj: documento,
        proxima_cobranca: vencimento,
        cancelado_em: null,
      })
      .eq("id", e.id);
    urlPagamento = (await cobrancasDaAssinatura(assinatura.id))[0]?.invoiceUrl;
  } catch (erro) {
    return erroAmigavel(erro);
  }
  revalidatePath("/app", "layout");
  if (urlPagamento) redirect(urlPagamento);
  return { sucesso: "Assinatura criada! A cobrança chega no seu e-mail." };
}

/** Abre a fatura em aberto (Pix, boleto ou cartão) no Asaas. */
export async function pagar(): Promise<EstadoForm> {
  const { e } = await dadosAssinatura();
  if (!e.asaas_assinatura_id) return { erro: "Você ainda não tem assinatura." };
  let url: string | undefined;
  try {
    const cobrancas = await cobrancasDaAssinatura(e.asaas_assinatura_id);
    url = cobrancas.find((c) => ["OVERDUE", "PENDING"].includes(c.status))?.invoiceUrl;
  } catch (erro) {
    return erroAmigavel(erro);
  }
  if (!url) return { sucesso: "Nenhuma cobrança em aberto. Está tudo pago!" };
  redirect(url);
}

/**
 * Upgrade: vale na hora; cobra a diferença proporcional aos dias que faltam
 * e as próximas mensalidades já vêm no valor novo.
 * Downgrade: vale a partir da próxima cobrança (o mês pago segue no plano atual).
 */
export async function trocarPlano(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const novo = plano.safeParse(form.get("plano"));
  if (!novo.success) return { erro: "Plano inválido." };
  const { e, db } = await dadosAssinatura();
  const atual = e.plano as PlanoId;
  if (novo.data === atual && !e.plano_proximo) return { sucesso: "Você já está neste plano." };

  // Sem assinatura (ainda no teste): só troca o plano.
  if (!e.asaas_assinatura_id) {
    await db.from("empresas").update({ plano: novo.data, plano_proximo: null }).eq("id", e.id);
    revalidatePath("/app", "layout");
    return { sucesso: `Plano ${PLANOS[novo.data].nome} escolhido.` };
  }

  let urlPagamento: string | undefined;
  try {
    const valorNovo = PLANOS[novo.data].precoCentavos;
    const subindo = valorNovo > PLANOS[atual].precoCentavos;
    if (subindo) {
      await atualizarValorAssinatura(e.asaas_assinatura_id, reais(valorNovo), false);
      const proporcional = e.status_assinatura === "ativo" ? valorProporcional(PLANOS[atual].precoCentavos, valorNovo, hojeIso(), e.proxima_cobranca) : 0;
      if (proporcional >= 500) {
        // Diferenças abaixo de R$ 5,00 não são cobradas (o Asaas tem valor mínimo de cobrança).
        const c = await criarCobrancaAvulsa({
          customer: e.asaas_cliente_id!,
          value: reais(proporcional),
          dueDate: hojeIso(),
          description: `Agilizou: diferença proporcional para o plano ${PLANOS[novo.data].nome}`,
          externalReference: `upgrade:${e.id}`,
        });
        urlPagamento = c.invoiceUrl;
      }
      await db.from("empresas").update({ plano: novo.data, plano_proximo: null }).eq("id", e.id);
    } else if (novo.data === atual) {
      // desistiu do downgrade agendado
      await atualizarValorAssinatura(e.asaas_assinatura_id, reais(valorNovo), false);
      await db.from("empresas").update({ plano_proximo: null }).eq("id", e.id);
    } else {
      await atualizarValorAssinatura(e.asaas_assinatura_id, reais(valorNovo), false);
      await db.from("empresas").update({ plano_proximo: novo.data }).eq("id", e.id);
    }
  } catch (erro) {
    return erroAmigavel(erro);
  }
  revalidatePath("/app", "layout");
  if (urlPagamento) redirect(urlPagamento);
  return { sucesso: "Plano atualizado." };
}

/** Cancela a renovação. O acesso segue até o fim do período já pago. */
export async function cancelarAssinatura(): Promise<EstadoForm> {
  const { e, db } = await dadosAssinatura();
  if (!e.asaas_assinatura_id) return { erro: "Você não tem assinatura ativa." };
  try {
    await cancelarAssinaturaAsaas(e.asaas_assinatura_id);
  } catch (erro) {
    return erroAmigavel(erro);
  }
  const fimPago = e.proxima_cobranca && e.proxima_cobranca > hojeIso();
  await db
    .from("empresas")
    .update({ cancelado_em: new Date().toISOString(), ...(fimPago && e.status_assinatura === "ativo" ? {} : { status_assinatura: "cancelado" }) })
    .eq("id", e.id);
  revalidatePath("/app", "layout");
  return { sucesso: fimPago ? "Renovação cancelada. Você continua com acesso até o fim do período pago." : "Assinatura cancelada." };
}
