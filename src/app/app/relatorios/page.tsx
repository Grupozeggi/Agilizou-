import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, FileText } from "lucide-react";
import { Aviso, Cartao } from "@/components/ui";
import { limitesDaEmpresa } from "@/config/planos";
import { hojeIso } from "@/lib/datas";
import { formatarReais } from "@/lib/dinheiro";
import { formatarQuantidade } from "@/lib/estoque";
import { maiuscula, somarMeses } from "@/lib/lancamentos";
import { exigirCliente } from "@/lib/sessao";
import { carregarRelatorios, periodoTexto, type TipoRelatorio } from "./dados";
import { periodoDosParametros } from "./periodo";

export const metadata: Metadata = { title: "Relatórios" };

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export default async function Relatorios({ searchParams }: PageProps<"/app/relatorios">) {
  const p = await searchParams;
  const { supabase, empresa } = await exigirCliente();
  const periodo = periodoDosParametros(p);
  const { resumo, mais, lucro, despesas, totalDespesas, margens } = await carregarRelatorios(supabase, periodo.inicio, periodo.fim);

  const limite = limitesDaEmpresa(empresa.plano, empresa.limites_personalizados).exportacoesPorMes;
  const inicioMes = new Date(`${hojeIso().slice(0, 7)}-01T00:00:00-03:00`).toISOString();
  const { count: usadas } = await supabase.from("exportacoes").select("id", { count: "exact", head: true }).gte("criado_em", inicioMes);
  const restantes = limite === Infinity ? Infinity : Math.max(0, limite - (usadas ?? 0));

  const qs = periodo.tipo === "personalizado" ? `periodo=personalizado&de=${periodo.inicio}&ate=${periodo.fim}` : `mes=${periodo.inicio.slice(0, 7)}`;
  const exportar = (r: TipoRelatorio | "completo", f: "csv" | "pdf") => `/app/relatorios/exportar?r=${r}&f=${f}&${qs}`;
  const mes = periodo.inicio.slice(0, 7);
  const maxMais = Math.max(1, ...mais.map((m) => m.receita));
  const maxDesp = Math.max(1, ...despesas.map((d) => d.total));
  const maxLucro = Math.max(1, ...lucro.map((l) => Math.abs(l.lucro)));
  const melhor = lucro.reduce((a, b) => (b.lucro > a.lucro ? b : a), lucro[0]);

  const botoes = (r: TipoRelatorio) =>
    restantes > 0 ? (
      <span className="flex gap-1">
        {(["csv", "pdf"] as const).map((f) => (
          <a key={f} href={exportar(r, f)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-borda px-2 text-xs font-semibold uppercase text-royal hover:bg-cartao">
            <Download className="size-3" /> {f}
          </a>
        ))}
      </span>
    ) : null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl">Relatórios</h1>
      {p.erro === "limite" && (
        <Aviso>
          Você já usou a exportação do mês do plano Essencial.{" "}
          <Link href="/app/assinatura" className="font-semibold underline">
            Fazer upgrade
          </Link>{" "}
          para exportar sem limite.
        </Aviso>
      )}
      <div className="flex items-center justify-between rounded-xl bg-white px-2 py-1 shadow-suave">
        <Link href={`/app/relatorios?mes=${somarMeses(`${mes}-01`, -1).slice(0, 7)}`} className="grid size-11 place-items-center text-royal" aria-label="Mês anterior">
          <ChevronLeft className="size-5" />
        </Link>
        <span className="font-semibold text-tinta">{maiuscula(periodoTexto(periodo.inicio, periodo.fim))}</span>
        <Link href={`/app/relatorios?mes=${somarMeses(`${mes}-01`, 1).slice(0, 7)}`} className="grid size-11 place-items-center text-royal" aria-label="Próximo mês">
          <ChevronRight className="size-5" />
        </Link>
      </div>

      <Cartao className="flex items-center justify-between gap-3 p-4">
        <span className="text-sm text-suave">
          {restantes === Infinity ? "Exportações ilimitadas no seu plano." : restantes > 0 ? `${restantes} exportação disponível este mês.` : "Exportação do mês já usada."}
        </span>
        {restantes > 0 && (
          <a href={exportar("completo", "pdf")} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-royal-vivo px-3 text-sm font-semibold text-white">
            <FileText className="size-4" /> PDF completo
          </a>
        )}
      </Cartao>

      <Secao titulo="Resultado do período" botoes={botoes("resultado")}>
        <dl className="space-y-1 text-sm">
          {[
            ["Receitas", resumo.receitas, "text-entrada"],
            ["(−) Custos", -resumo.custos, "text-saida"],
            ["(−) Despesas", -resumo.despesas, "text-saida"],
          ].map(([r, v, cor]) => (
            <div key={r as string} className="flex justify-between">
              <dt className="text-texto">{r}</dt>
              <dd className={`numero ${cor}`}>{formatarReais(v as number)}</dd>
            </div>
          ))}
          <div className="flex justify-between border-t border-borda pt-1 font-semibold text-tinta">
            <dt>(=) Lucro</dt>
            <dd className="numero">{formatarReais(resumo.receitas - resumo.custos - resumo.despesas)}</dd>
          </div>
        </dl>
      </Secao>

      <Secao titulo="Mais vendidos" botoes={botoes("mais-vendidos")}>
        {mais.length === 0 ? (
          <Vazio />
        ) : (
          <ul className="space-y-2.5">
            {mais.slice(0, 10).map((m, i) => (
              <li key={m.descricao + i} className="text-sm">
                <div className="flex justify-between gap-2">
                  <span className="truncate text-tinta">
                    {m.descricao} <span className="text-xs text-suave">· {formatarQuantidade(m.quantidade)}×</span>
                  </span>
                  <span className="numero shrink-0 font-semibold text-tinta">{formatarReais(m.receita)}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-cartao">
                  <div className={`h-2 rounded-full ${i === 0 ? "bg-dourado" : "bg-royal-vivo"}`} style={{ width: `${(m.receita / maxMais) * 100}%` }} />
                </div>
                <p className="mt-0.5 text-xs text-suave">lucro {formatarReais(m.lucro)}</p>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo="Maior margem" botoes={botoes("margem")}>
        {margens.length === 0 ? (
          <Vazio texto="Cadastre produtos com preço para ver a margem." />
        ) : (
          <ul className="divide-y divide-borda text-sm">
            {margens.slice(0, 10).map(({ p: prod, m }) => (
              <li key={prod.id} className="flex justify-between gap-2 py-2">
                <span className="truncate text-tinta">{prod.nome}</span>
                <span className="numero shrink-0">
                  <span className="text-suave">{formatarReais(m.valor)}/un · </span>
                  <span className={`font-semibold ${m.valor < 0 ? "text-saida" : "text-tinta"}`}>{m.percentual?.toLocaleString("pt-BR")}%</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo="Despesas por categoria" botoes={botoes("despesas")}>
        {despesas.length === 0 ? (
          <Vazio />
        ) : (
          <ul className="space-y-2.5">
            {despesas.map((d) => (
              <li key={d.categoria} className="text-sm">
                <div className="flex justify-between gap-2">
                  <span className="truncate text-tinta">{d.categoria}</span>
                  <span className="numero shrink-0 text-saida">{formatarReais(d.total)}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-cartao">
                  <div className="h-2 rounded-full bg-[#A9BCF5]" style={{ width: `${(d.total / maxDesp) * 100}%` }} />
                </div>
              </li>
            ))}
            <li className="flex justify-between border-t border-borda pt-2 text-sm font-semibold text-tinta">
              <span>Total</span>
              <span className="numero">{formatarReais(totalDespesas)}</span>
            </li>
          </ul>
        )}
      </Secao>

      <Secao titulo="Evolução do lucro (12 meses)" botoes={botoes("lucro")}>
        <svg viewBox="0 0 360 170" className="h-48 w-full" role="img" aria-label="Lucro mês a mês">
          <line x1="0" x2="360" y1="85" y2="85" stroke="#E3E8F2" />
          {lucro.map((l, i) => {
            const x = i * 30 + 6;
            const h = (Math.abs(l.lucro) / maxLucro) * 70;
            const destaque = l === melhor && l.lucro > 0;
            return (
              <g key={l.mes}>
                <rect x={x} y={l.lucro >= 0 ? 85 - h : 85} width="18" height={Math.max(h, 1)} rx="3" fill={destaque ? "#C9A24B" : l.lucro >= 0 ? "#2F5BEA" : "#F5A3A3"}>
                  <title>{`${l.mes}: ${formatarReais(l.lucro)}`}</title>
                </rect>
                <text x={x + 9} y="166" textAnchor="middle" fontSize="10" fill={l.mes === mes ? "#0B2A6F" : "#5B6785"} fontWeight={l.mes === mes ? 700 : 400}>
                  {MESES[Number(l.mes.slice(5)) - 1]}
                </text>
              </g>
            );
          })}
        </svg>
        {melhor && melhor.lucro > 0 && (
          <p className="text-xs text-suave">
            <span className="mr-1 inline-block size-2 rounded-sm bg-dourado" />
            Melhor mês: {MESES[Number(melhor.mes.slice(5)) - 1]}/{melhor.mes.slice(0, 4)} com {formatarReais(melhor.lucro)} de lucro.
          </p>
        )}
      </Secao>
    </div>
  );
}

function Secao({ titulo, botoes, children }: { titulo: string; botoes: React.ReactNode; children: React.ReactNode }) {
  return (
    <Cartao className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base">{titulo}</h2>
        {botoes}
      </div>
      {children}
    </Cartao>
  );
}

function Vazio({ texto = "Sem dados no período." }: { texto?: string }) {
  return <p className="text-sm text-suave">{texto}</p>;
}
