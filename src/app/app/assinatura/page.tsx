import type { Metadata } from "next";
import { BadgeCheck, CalendarClock } from "lucide-react";
import { Aviso, Cartao } from "@/components/ui";
import { Voltar } from "@/components/voltar";
import { PLANOS, type PlanoId } from "@/config/planos";
import { mensagemSomenteLeitura } from "@/lib/assinatura";
import { dataSp, formatarData } from "@/lib/datas";
import { formatarReais } from "@/lib/dinheiro";
import { exigirCliente } from "@/lib/sessao";
import { AcoesAssinatura } from "./componentes";

export const metadata: Metadata = { title: "Assinatura" };

const STATUS = {
  teste: "Teste grátis",
  ativo: "Ativa",
  inadimplente: "Pagamento em aberto",
  cancelado: "Cancelada",
  suspenso: "Suspensa",
};

export default async function Assinatura() {
  const { empresa, supabase } = await exigirCliente();
  const { data: extra } = await supabase
    .from("empresas")
    .select("asaas_assinatura_id, proxima_cobranca, plano_proximo, cancelado_em")
    .eq("id", empresa.id)
    .single();
  const bloqueio = mensagemSomenteLeitura(empresa.status_assinatura, empresa.teste_ate);
  const assinante = Boolean(extra?.asaas_assinatura_id) && empresa.status_assinatura !== "cancelado";
  const fmt = (n: number) => (n === Infinity ? "Ilimitado" : n.toLocaleString("pt-BR"));

  return (
    <div className="space-y-4">
      <Voltar href="/app/configuracoes">Ajustes</Voltar>
      <h1 className="text-2xl">Assinatura</h1>
      {bloqueio && <Aviso>{bloqueio}</Aviso>}

      <Cartao className="space-y-1">
        <p className="text-sm text-suave">Situação</p>
        <p className="text-lg font-semibold text-tinta">
          {empresa.status_assinatura === "teste" && bloqueio ? "Teste encerrado" : STATUS[empresa.status_assinatura]} · {PLANOS[empresa.plano].nome}
        </p>
        {empresa.status_assinatura === "teste" && <p className="text-sm text-suave">Teste até {formatarData(dataSp(empresa.teste_ate))}.</p>}
        {extra?.proxima_cobranca && assinante && (
          <p className="flex items-center gap-1.5 text-sm text-suave">
            <CalendarClock className="size-4" /> Próxima cobrança: {formatarData(extra.proxima_cobranca)}
            {extra.cancelado_em ? " (renovação cancelada)" : ""}
          </p>
        )}
        {extra?.plano_proximo && (
          <p className="text-sm text-suave">Muda para o {PLANOS[extra.plano_proximo as PlanoId].nome} na próxima cobrança.</p>
        )}
      </Cartao>

      <AcoesAssinatura assinante={assinante} planoAtual={empresa.plano} planoProximo={(extra?.plano_proximo as PlanoId | null) ?? null} statusAtivo={empresa.status_assinatura === "ativo"} />

      <div className="grid gap-3 sm:grid-cols-2">
        {Object.values(PLANOS).map((p) => (
          <Cartao key={p.id} className={p.destaque ? "ring-1 ring-dourado/60" : ""}>
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg">
                {p.nome}
                {p.destaque && <BadgeCheck className="size-5 text-dourado" strokeWidth={1.75} />}
              </h2>
              <p className="numero font-semibold text-tinta">{formatarReais(p.precoCentavos)}/mês</p>
            </div>
            <ul className="mt-3 space-y-1 text-sm text-texto">
              <li>{fmt(p.limites.lancamentosPorMes)} lançamentos por mês</li>
              <li>{fmt(p.limites.produtos)} produtos</li>
              <li>{fmt(p.limites.clientes)} clientes</li>
              <li>{fmt(p.limites.profissionais)} profissionais na agenda</li>
              <li>{p.limites.exportacoesPorMes === Infinity ? "Relatórios e exportações ilimitados" : `${p.limites.exportacoesPorMes} relatório exportável por mês`}</li>
              <li>{p.limites.mensagensWhatsappPorMes ? `Lembretes automáticos no WhatsApp (até ${p.limites.mensagensWhatsappPorMes}/mês)` : "Cobrança manual pelo WhatsApp"}</li>
            </ul>
          </Cartao>
        ))}
      </div>
      <p className="px-1 text-xs text-suave">
        Pagamento por Pix, boleto ou cartão, processado pelo Asaas. Upgrade vale na hora, com cobrança proporcional aos dias que faltam; downgrade vale a partir da
        próxima cobrança. Cancelando, seus dados ficam guardados.
      </p>
    </div>
  );
}
