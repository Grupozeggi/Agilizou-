import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { somarDias } from "@/lib/datas";
import { somarMeses } from "@/lib/lancamentos";
import { criarClienteServico } from "@/lib/supabase/servico";

/**
 * Webhook do Asaas: ativa, marca inadimplência ou cancela a assinatura.
 * Configure no Asaas (Integrações → Webhooks) com o mesmo token de
 * ASAAS_WEBHOOK_TOKEN; ele chega no cabeçalho "asaas-access-token".
 */
function tokenValido(recebido: string | null) {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Evento = {
  id?: string;
  event: string;
  payment?: { id: string; subscription?: string; externalReference?: string; dueDate?: string; status?: string };
  subscription?: { id: string; externalReference?: string };
};

export async function POST(request: Request) {
  if (!tokenValido(request.headers.get("asaas-access-token"))) {
    return NextResponse.json({ erro: "Token inválido." }, { status: 401 });
  }
  const evento = (await request.json().catch(() => null)) as Evento | null;
  if (!evento?.event) return NextResponse.json({ erro: "Evento inválido." }, { status: 400 });

  const db = criarClienteServico();
  const assinaturaId = evento.payment?.subscription ?? evento.subscription?.id;
  const referencia = evento.payment?.externalReference ?? evento.subscription?.externalReference ?? "";

  // Cobrança avulsa do upgrade proporcional: só registra.
  if (referencia.startsWith("upgrade:")) return NextResponse.json({ ok: true, ignorado: "proporcional" });

  let empresa: { id: string; plano: string; plano_proximo: string | null } | null = null;
  if (assinaturaId) {
    empresa = (await db.from("empresas").select("id, plano, plano_proximo").eq("asaas_assinatura_id", assinaturaId).maybeSingle()).data;
  }
  if (!empresa && /^[0-9a-f-]{36}$/.test(referencia)) {
    empresa = (await db.from("empresas").select("id, plano, plano_proximo").eq("id", referencia).maybeSingle()).data;
  }
  if (!empresa) return NextResponse.json({ ok: true, ignorado: "empresa não encontrada" });

  // Idempotência: o mesmo evento pode chegar mais de uma vez.
  const chave = evento.id ?? `${evento.event}:${evento.payment?.id ?? evento.subscription?.id}`;
  const { data: novo } = await db
    .from("asaas_eventos")
    .upsert({ id: chave, evento: evento.event, empresa_id: empresa.id }, { onConflict: "id", ignoreDuplicates: true })
    .select("id");
  if (!novo?.length) return NextResponse.json({ ok: true, repetido: true });

  switch (evento.event) {
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED": {
      const vencimento = evento.payment?.dueDate;
      await db
        .from("empresas")
        .update({
          status_assinatura: "ativo",
          cancelado_em: null,
          // downgrade agendado vale a partir do pagamento do novo ciclo
          plano: empresa.plano_proximo ?? empresa.plano,
          plano_proximo: null,
          proxima_cobranca: vencimento ? somarMeses(vencimento, 1) : somarDias(new Date().toISOString().slice(0, 10), 30),
        })
        .eq("id", empresa.id);
      break;
    }
    case "PAYMENT_OVERDUE":
      await db.from("empresas").update({ status_assinatura: "inadimplente" }).eq("id", empresa.id).neq("status_assinatura", "cancelado");
      break;
    case "SUBSCRIPTION_DELETED":
    case "SUBSCRIPTION_INACTIVATED":
      await db.from("empresas").update({ status_assinatura: "cancelado", cancelado_em: new Date().toISOString() }).eq("id", empresa.id);
      break;
    default:
      break;
  }
  return NextResponse.json({ ok: true });
}
