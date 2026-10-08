import type { Metadata } from "next";
import { BadgeCheck } from "lucide-react";
import { Voltar } from "@/components/voltar";
import { Cartao } from "@/components/ui";
import { PLANOS } from "@/config/planos";
import { formatarData } from "@/lib/datas";
import { formatarReais } from "@/lib/dinheiro";
import { exigirCliente } from "@/lib/sessao";

export const metadata: Metadata = { title: "Assinatura" };

const STATUS = {
  teste: "Teste grátis",
  ativo: "Ativa",
  inadimplente: "Pagamento pendente",
  cancelado: "Cancelada",
  suspenso: "Suspensa",
};

// Versão inicial: mostra o plano e os limites. O pagamento pelo Asaas
// (assinar, upgrade, downgrade) entra na etapa 10.
export default async function Assinatura() {
  const { empresa } = await exigirCliente();
  const fmt = (n: number) => (n === Infinity ? "Ilimitado" : n.toLocaleString("pt-BR"));

  return (
    <div className="space-y-4">
      <Voltar href="/app/configuracoes">Ajustes</Voltar>
      <h1 className="text-2xl">Assinatura</h1>
      <Cartao>
        <p className="text-sm text-suave">Situação</p>
        <p className="text-lg font-semibold text-tinta">{STATUS[empresa.status_assinatura]}</p>
        {empresa.status_assinatura === "teste" && (
          <p className="text-sm text-suave">Seu teste vai até {formatarData(empresa.teste_ate.slice(0, 10))}.</p>
        )}
      </Cartao>
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
            <li>{p.limites.exportacoesPorMes === Infinity ? "Relatórios ilimitados" : `${p.limites.exportacoesPorMes} relatório exportável por mês`}</li>
            <li>{p.limites.mensagensWhatsappPorMes ? `Lembretes automáticos por WhatsApp (até ${p.limites.mensagensWhatsappPorMes}/mês)` : "Cobrança manual pelo WhatsApp"}</li>
          </ul>
          {empresa.plano === p.id && empresa.status_assinatura !== "teste" && (
            <p className="mt-3 text-sm font-semibold text-royal">Seu plano atual</p>
          )}
        </Cartao>
      ))}
      <p className="text-center text-sm text-suave">Em breve você vai poder assinar e trocar de plano por aqui.</p>
    </div>
  );
}
