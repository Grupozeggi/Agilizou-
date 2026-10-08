import { NextResponse } from "next/server";
import { limitesDaEmpresa, type Limites, type PlanoId } from "@/config/planos";
import { cronAutorizado } from "@/lib/cron";
import { hojeIso } from "@/lib/datas";
import { decidirEnvio, proximaTentativa } from "@/lib/whatsapp-fila";
import { criarClienteServico } from "@/lib/supabase/servico";
import { provedorWhatsapp } from "@/services/whatsapp";

/**
 * Fila de envio de WhatsApp. Roda a cada 10 minutos (Vercel Cron) e manda
 * as mensagens cujo horário chegou. Antes de cada envio confere se o
 * agendamento ainda está aberto, o consentimento do cliente e o limite do plano.
 */
export async function GET(request: Request) {
  if (!cronAutorizado(request)) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const db = criarClienteServico();
  const provedor = provedorWhatsapp();
  const { data: lote, error } = await db.rpc("pegar_mensagens_para_envio", { p_limite: 50 });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  // Primeiro dia do mês em São Paulo.
  const inicioMes = new Date(`${hojeIso().slice(0, 7)}-01T00:00:00-03:00`).toISOString();
  const usoCache = new Map<string, number>();
  const resultado = { enviadas: 0, canceladas: 0, falhas: 0, reagendadas: 0, provedor: provedor.nome };

  for (const m of (lote ?? []) as { id: string; empresa_id: string; agendamento_id: string; telefone: string; conteudo: string; tentativas: number }[]) {
    const [{ data: ag }, { data: emp }] = await Promise.all([
      db.from("agendamentos").select("status, inicio, deleted_at, cliente:clientes(whatsapp, aceita_mensagens)").eq("id", m.agendamento_id).maybeSingle(),
      db.from("empresas").select("whatsapp_ativo, plano, limites_personalizados").eq("id", m.empresa_id).single(),
    ]);
    if (!usoCache.has(m.empresa_id)) {
      const { count } = await db
        .from("mensagens_whatsapp")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", m.empresa_id)
        .in("status", ["enviada", "entregue", "lida"])
        .gte("enviado_em", inicioMes);
      usoCache.set(m.empresa_id, count ?? 0);
    }
    const cliente = (ag?.cliente ?? null) as { whatsapp: string | null; aceita_mensagens: boolean } | null;
    const decisao = decidirEnvio({
      agendamento: ag && !ag.deleted_at ? { status: ag.status, inicio: ag.inicio } : null,
      cliente,
      empresa: {
        whatsapp_ativo: Boolean(emp?.whatsapp_ativo),
        limiteMensal: emp ? limitesDaEmpresa(emp.plano as PlanoId, emp.limites_personalizados as Partial<Limites> | null).mensagensWhatsappPorMes : 0,
        enviadasNoMes: usoCache.get(m.empresa_id)!,
      },
      agora: new Date().toISOString(),
    });

    if (decisao.acao === "cancelar") {
      await db.from("mensagens_whatsapp").update({ status: "cancelada", erro: decisao.motivo }).eq("id", m.id);
      resultado.canceladas++;
      continue;
    }
    if (decisao.acao === "falhar") {
      await db.from("mensagens_whatsapp").update({ status: "falhou", erro: decisao.motivo }).eq("id", m.id);
      resultado.falhas++;
      continue;
    }

    // Usa o número atual do cliente (pode ter sido corrigido depois do agendamento).
    const envio = await provedor.enviarLembrete(cliente!.whatsapp!, m.conteudo);
    if (envio.ok) {
      await db
        .from("mensagens_whatsapp")
        .update({ status: "enviada", provedor_mensagem_id: envio.id, enviado_em: new Date().toISOString(), erro: null, telefone: cliente!.whatsapp })
        .eq("id", m.id);
      usoCache.set(m.empresa_id, usoCache.get(m.empresa_id)! + 1);
      resultado.enviadas++;
    } else {
      const novaData = proximaTentativa(m.tentativas, envio.definitivo, new Date());
      await db
        .from("mensagens_whatsapp")
        .update(novaData ? { status: "pendente", agendado_para: novaData, erro: envio.erro } : { status: "falhou", erro: envio.erro })
        .eq("id", m.id);
      if (novaData) resultado.reagendadas++;
      else resultado.falhas++;
    }
  }
  return NextResponse.json(resultado);
}
