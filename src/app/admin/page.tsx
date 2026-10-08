import type { Metadata } from "next";
import Link from "next/link";
import { Cartao } from "@/components/ui";
import { NICHOS, type NichoId } from "@/config/nichos";
import { PLANOS, type PlanoId } from "@/config/planos";
import { formatarReais } from "@/lib/dinheiro";
import { exigirAdmin } from "@/lib/sessao";

export const metadata: Metadata = { title: "Admin" };

type Painel = {
  total: number;
  novos_mes: number;
  cancelados_mes: number;
  ativos_por_plano: Partial<Record<PlanoId, number>>;
  por_status: Record<string, number>;
  por_nicho: Record<string, number>;
  whatsapp_mes: number;
  testes_acabando: number;
  testes_vencidos: number;
  querem_marketing: number;
  agendamento_online: number;
};

const STATUS: Record<string, string> = { teste: "Em teste", ativo: "Ativos", inadimplente: "Inadimplentes", cancelado: "Cancelados", suspenso: "Suspensos" };

export default async function PainelAdmin() {
  const { supabase } = await exigirAdmin();
  const { data, error } = await supabase.rpc("admin_painel");
  if (error) throw new Error("Não foi possível carregar o painel.");
  const p = data as Painel;
  const mrr = (Object.keys(PLANOS) as PlanoId[]).reduce((s, id) => s + (p.ativos_por_plano[id] ?? 0) * PLANOS[id].precoCentavos, 0);
  const ativos = Object.values(p.ativos_por_plano).reduce((s, n) => s + (n ?? 0), 0);
  const churn = ativos + p.cancelados_mes > 0 ? Math.round((p.cancelados_mes / (ativos + p.cancelados_mes)) * 1000) / 10 : 0;

  // [rótulo, valor, link para a lista já filtrada (quando existe)]
  const cards: [string, string, string?][] = [
    ["Clientes (empresas)", String(p.total), "/admin/empresas"],
    ["MRR", formatarReais(mrr)],
    ["Novos no mês", String(p.novos_mes)],
    ["Cancelamentos no mês (churn)", `${p.cancelados_mes} · ${churn.toLocaleString("pt-BR")}%`],
    ["Inadimplentes", String(p.por_status.inadimplente ?? 0), "/admin/empresas?f=inadimplentes"],
    ["Testes acabando em 3 dias", String(p.testes_acabando ?? 0), "/admin/empresas?f=teste-acabando"],
    ["Testes vencidos sem assinar", String(p.testes_vencidos ?? 0), "/admin/empresas?f=teste-vencido"],
    ["Pediram contato de marketing", String(p.querem_marketing ?? 0), "/admin/empresas?f=marketing"],
    ["Com link de agendamento ligado", String(p.agendamento_online ?? 0)],
    ["WhatsApp enviados no mês", String(p.whatsapp_mes)],
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl">Painel geral</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {cards.map(([r, v, href]) => {
          const conteudo = (
            <Cartao className={`h-full p-4 ${href ? "transition-colors hover:bg-cartao" : ""}`}>
              <p className="text-xs text-suave">{r}</p>
              <p className="numero mt-1 text-2xl font-semibold text-tinta">{v}</p>
            </Cartao>
          );
          return href ? (
            <Link key={r} href={href}>
              {conteudo}
            </Link>
          ) : (
            <div key={r}>{conteudo}</div>
          );
        })}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Distribuicao titulo="Ativos por plano" dados={Object.fromEntries((Object.keys(PLANOS) as PlanoId[]).map((id) => [PLANOS[id].nome, p.ativos_por_plano[id] ?? 0]))} />
        <Distribuicao titulo="Por situação" dados={Object.fromEntries(Object.entries(p.por_status).map(([k, v]) => [STATUS[k] ?? k, v]))} />
        <Distribuicao titulo="Por nicho" dados={Object.fromEntries(Object.entries(p.por_nicho).map(([k, v]) => [NICHOS[k as NichoId]?.nome ?? k, v]))} />
      </div>
    </div>
  );
}

function Distribuicao({ titulo, dados }: { titulo: string; dados: Record<string, number> }) {
  const max = Math.max(1, ...Object.values(dados));
  return (
    <Cartao className="p-4">
      <h2 className="text-base">{titulo}</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {Object.entries(dados).map(([k, v]) => (
          <li key={k}>
            <div className="flex justify-between">
              <span className="text-texto">{k}</span>
              <span className="numero font-semibold text-tinta">{v}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-cartao">
              <div className="h-1.5 rounded-full bg-royal-vivo" style={{ width: `${(v / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Cartao>
  );
}
