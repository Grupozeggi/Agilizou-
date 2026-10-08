import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CalendarClock, ChevronRight, ListChecks, Sparkles } from "lucide-react";
import { GraficoEntradasSaidas } from "@/components/grafico-barras";
import { Cartao } from "@/components/ui";
import { dataSp, diasEntre, formatarData } from "@/lib/datas";
import { formatarReais, percentual } from "@/lib/dinheiro";
import { resolverPeriodo, type TipoPeriodo } from "@/lib/periodo";
import { carregarResumo, lucro } from "@/lib/resumo";
import { exigirCliente } from "@/lib/sessao";
import { hojeIso } from "@/lib/datas";

export const metadata: Metadata = { title: "Início" };

const PERIODOS: [TipoPeriodo, string][] = [
  ["hoje", "Hoje"],
  ["semana", "Semana"],
  ["mes", "Mês"],
  ["personalizado", "Outro"],
];

const NOME_PERIODO: Record<TipoPeriodo, string> = {
  hoje: "de hoje",
  semana: "da semana",
  mes: "do mês",
  personalizado: "do período",
};

export default async function Inicio({ searchParams }: PageProps<"/app">) {
  const { empresa, supabase } = await exigirCliente();
  const hoje = hojeIso();
  const periodo = resolverPeriodo(await searchParams, hoje);
  const [r, paraHoje] = await Promise.all([carregarResumo(supabase, periodo.inicio, periodo.fim), contarParaHoje(supabase, hoje)]);
  const resultado = lucro(r);
  const margem = percentual(resultado, r.receitas);
  const fimTeste = dataSp(empresa.teste_ate);
  const diasTeste = Math.max(0, diasEntre(hoje, fimTeste));
  const alertasPagar = r.pagar_vencidas.qtd + r.pagar_7dias.qtd;
  const alertasReceber = r.receber_vencidas.qtd + r.receber_7dias.qtd;

  return (
    <div className="space-y-4">
      {empresa.status_assinatura === "teste" && (
        <Link href="/app/assinatura" className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm shadow-suave">
          <Sparkles className="size-4 shrink-0 text-dourado" strokeWidth={1.75} />
          <span className="flex-1 text-texto">
            Teste grátis: <strong className="text-tinta">{diasTeste === 1 ? "falta 1 dia" : `faltam ${diasTeste} dias`}</strong>{" "}
            (até {formatarData(fimTeste)})
          </span>
          <ChevronRight className="size-4 text-suave" />
        </Link>
      )}

      {paraHoje > 0 && (
        <Link href="/app/hoje" className="flex items-center gap-3 rounded-cartao bg-white p-4 shadow-suave ring-1 ring-dourado/50">
          <span className="grid size-10 place-items-center rounded-full bg-dourado/10 text-dourado">
            <ListChecks className="size-5" strokeWidth={1.75} />
          </span>
          <span className="flex-1">
            <span className="block font-semibold text-tinta">
              {paraHoje === 1 ? "1 coisa para hoje" : `${paraHoje} coisas para hoje`}
            </span>
            <span className="block text-sm text-suave">Contas, cobranças, lembretes e atendimentos</span>
          </span>
          <ChevronRight className="size-5 text-suave" />
        </Link>
      )}

      {/* Saldo atual: a informação mais importante, em destaque */}
      <section className="rounded-cartao bg-royal-escuro p-5 text-white shadow-suave">
        <p className="text-sm text-white/70">Saldo atual do caixa</p>
        <p className={`numero mt-1 text-4xl font-semibold ${r.saldo_atual < 0 ? "text-[#FCA5A5]" : ""}`}>
          {formatarReais(r.saldo_atual)}
        </p>
        <div className="mt-3 h-px w-12 bg-dourado" />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Link
            href="/app/lancamentos/novo?tipo=entrada"
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-white/10 font-semibold hover:bg-white/20"
          >
            <ArrowDownLeft className="size-5" strokeWidth={2} /> Entrada
          </Link>
          <Link
            href="/app/lancamentos/novo?tipo=saida"
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-white/10 font-semibold hover:bg-white/20"
          >
            <ArrowUpRight className="size-5" strokeWidth={2} /> Saída
          </Link>
        </div>
      </section>

      {/* Filtro de período */}
      <nav className="grid grid-cols-4 gap-1 rounded-xl bg-white p-1 shadow-suave" aria-label="Período">
        {PERIODOS.map(([tipo, rotulo]) => (
          <Link
            key={tipo}
            href={tipo === "mes" ? "/app" : `/app?periodo=${tipo}`}
            aria-current={periodo.tipo === tipo ? "true" : undefined}
            className={`flex h-10 items-center justify-center rounded-lg text-sm font-semibold ${
              periodo.tipo === tipo ? "bg-royal-vivo text-white" : "text-suave"
            }`}
          >
            {rotulo}
          </Link>
        ))}
      </nav>
      {periodo.tipo === "personalizado" && (
        <form className="flex items-end gap-2" action="/app">
          <input type="hidden" name="periodo" value="personalizado" />
          <label className="flex-1 text-sm text-tinta">
            De
            <input type="date" name="de" defaultValue={periodo.inicio} className="mt-1 h-11 w-full rounded-xl border border-borda bg-white px-3" />
          </label>
          <label className="flex-1 text-sm text-tinta">
            Até
            <input type="date" name="ate" defaultValue={periodo.fim} className="mt-1 h-11 w-full rounded-xl border border-borda bg-white px-3" />
          </label>
          <button type="submit" className="h-11 rounded-xl bg-royal-vivo px-4 text-sm font-semibold text-white">
            Ver
          </button>
        </form>
      )}
      {periodo.tipo !== "hoje" && (
        <p className="-mt-2 px-1 text-xs text-suave">
          {formatarData(periodo.inicio)} a {formatarData(periodo.fim)}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Numero rotulo="Entradas" valor={r.entradas} cor="text-entrada" />
        <Numero rotulo="Saídas" valor={r.saidas} cor="text-saida" />
        <Numero rotulo="Lucro" valor={resultado} cor={resultado < 0 ? "text-saida" : "text-tinta"} destaque />
      </div>

      {(alertasPagar > 0 || alertasReceber > 0) && (
        <Link href="/app/contas" className="block">
          <Cartao className="space-y-2 p-4 hover:bg-cartao">
            <h2 className="flex items-center gap-2 text-base">
              <CalendarClock className="size-5 text-royal" strokeWidth={1.75} /> Contas vencendo
              <ChevronRight className="ml-auto size-4 text-suave" />
            </h2>
            {r.pagar_vencidas.qtd > 0 && (
              <p className="flex items-center gap-2 text-sm text-saida">
                <AlertTriangle className="size-4" strokeWidth={1.75} />
                {r.pagar_vencidas.qtd} {r.pagar_vencidas.qtd === 1 ? "conta vencida" : "contas vencidas"} a pagar ·{" "}
                <span className="numero font-semibold">{formatarReais(r.pagar_vencidas.total)}</span>
              </p>
            )}
            {r.pagar_7dias.qtd > 0 && (
              <p className="text-sm text-texto">
                A pagar nos próximos 7 dias: {r.pagar_7dias.qtd} ·{" "}
                <span className="numero font-semibold">{formatarReais(r.pagar_7dias.total)}</span>
              </p>
            )}
            {alertasReceber > 0 && (
              <p className="text-sm text-texto">
                A receber{r.receber_vencidas.qtd ? ` (${r.receber_vencidas.qtd} atrasada${r.receber_vencidas.qtd > 1 ? "s" : ""})` : ""}:{" "}
                <span className="numero font-semibold text-entrada">
                  {formatarReais(r.receber_vencidas.total + r.receber_7dias.total)}
                </span>
              </p>
            )}
          </Cartao>
        </Link>
      )}

      <Cartao className="p-4">
        <h2 className="text-base">Entradas x saídas</h2>
        <div className="mt-3">
          <GraficoEntradasSaidas serie={r.serie} mesAtual={periodo.fim.slice(0, 7)} />
        </div>
      </Cartao>

      <Cartao className="p-4">
        <h2 className="text-base">Resultado {NOME_PERIODO[periodo.tipo]}</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <LinhaDre rotulo="Receitas" valor={r.receitas} cor="text-entrada" />
          <LinhaDre rotulo="(−) Custos" ajuda="ligados ao que você vende" valor={-r.custos} cor="text-saida" />
          <LinhaDre rotulo="(−) Despesas" ajuda="do dia a dia" valor={-r.despesas} cor="text-saida" />
          <div className="border-t border-borda pt-2">
            <LinhaDre rotulo="(=) Lucro" valor={resultado} cor={resultado < 0 ? "text-saida" : "text-tinta"} forte />
          </div>
        </dl>
        {margem !== null && (
          <p className="mt-2 text-xs text-suave">
            De cada R$ 100 que entraram, {margem >= 0 ? "sobraram" : "faltaram"} R${" "}
            {Math.abs(margem).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}.
          </p>
        )}
        {(r.a_receber_periodo > 0 || r.a_pagar_periodo > 0) && (
          <p className="mt-2 text-xs text-suave">
            Ainda pendente no período: {formatarReais(r.a_receber_periodo)} a receber e {formatarReais(r.a_pagar_periodo)} a pagar.
          </p>
        )}
      </Cartao>
    </div>
  );
}

function Numero({ rotulo, valor, cor, destaque }: { rotulo: string; valor: number; cor: string; destaque?: boolean }) {
  return (
    <div className={`min-w-0 rounded-cartao bg-white p-3 shadow-suave ${destaque ? "border-t-2 border-dourado" : ""}`}>
      <p className="text-xs text-suave">{rotulo}</p>
      <p className={`numero mt-0.5 truncate text-sm font-semibold sm:text-lg ${cor}`}>{formatarReais(valor)}</p>
    </div>
  );
}

function LinhaDre({ rotulo, ajuda, valor, cor, forte }: { rotulo: string; ajuda?: string; valor: number; cor: string; forte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className={forte ? "font-semibold text-tinta" : "text-texto"}>
        {rotulo} {ajuda && <span className="text-xs text-suave">{ajuda}</span>}
      </dt>
      <dd className={`numero ${forte ? "text-base font-semibold" : ""} ${cor}`}>{formatarReais(valor)}</dd>
    </div>
  );
}

/** Quantas coisas o dono tem para fazer hoje (inclui atrasadas). */
async function contarParaHoje(supabase: Awaited<ReturnType<typeof exigirCliente>>["supabase"], hoje: string) {
  const contar = (r: { count: number | null }) => r.count ?? 0;
  const [contas, lembretes, atendimentos] = await Promise.all([
    supabase.from("lancamentos").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", "pendente").lte("data", hoje),
    supabase.from("lembretes").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("feito", false).lte("data", hoje),
    supabase
      .from("agendamentos")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .in("status", ["agendado", "confirmado"])
      .gte("inicio", `${hoje}T00:00:00-03:00`)
      .lte("inicio", `${hoje}T23:59:59-03:00`),
  ]);
  return contar(contas) + contar(lembretes) + contar(atendimentos);
}
