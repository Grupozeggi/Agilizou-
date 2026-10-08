import type { Metadata } from "next";
import Link from "next/link";
import { Cartao } from "@/components/ui";
import { Voltar } from "@/components/voltar";
import { minutosDisponiveis, taxas, type Indicadores } from "@/lib/agenda";
import { formatarData, hojeIso } from "@/lib/datas";
import { formatarReais } from "@/lib/dinheiro";
import { resolverPeriodo } from "@/lib/periodo";
import { exigirCliente } from "@/lib/sessao";
import { cadastrosAgenda } from "../dados";

export const metadata: Metadata = { title: "Indicadores da agenda" };

const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR")}%`);

export default async function IndicadoresAgenda({ searchParams }: PageProps<"/app/agenda/indicadores">) {
  const { supabase } = await exigirCliente();
  const periodo = resolverPeriodo(await searchParams, hojeIso());
  const [{ data, error }, cad] = await Promise.all([
    supabase.rpc("indicadores_agenda", { p_inicio: periodo.inicio, p_fim: periodo.fim }),
    cadastrosAgenda(supabase),
  ]);
  if (error) throw new Error("Não foi possível calcular os indicadores.");
  const i = data as Indicadores;
  const disponivel = minutosDisponiveis({
    inicio: periodo.inicio,
    fim: periodo.fim,
    dias: cad.horario.dias,
    abertura: cad.horario.abertura,
    fechamento: cad.horario.fechamento,
    profissionais: Math.max(1, cad.profissionais.length),
  });
  const t = taxas(i, disponivel);

  const cards = [
    { rotulo: "Comparecimento", valor: pct(t.comparecimento), cor: "text-entrada" },
    { rotulo: "Faltas", valor: pct(t.falta), cor: "text-saida" },
    { rotulo: "Receita perdida com faltas", valor: formatarReais(i.receita_perdida), cor: "text-saida" },
    { rotulo: "Horas vagas", valor: `${t.horasVagas.toLocaleString("pt-BR")} h`, cor: "text-tinta" },
    { rotulo: "Agenda ocupada", valor: pct(t.ocupacao), cor: "text-tinta" },
    { rotulo: "Clientes que voltaram (90 dias)", valor: pct(t.retorno), cor: "text-tinta" },
  ];

  return (
    <div className="space-y-4">
      <Voltar href="/app/agenda">Agenda</Voltar>
      <h1 className="text-2xl">Indicadores</h1>
      <nav className="grid grid-cols-3 gap-1 rounded-xl bg-white p-1 shadow-suave">
        {[
          ["semana", "Semana"],
          ["mes", "Mês"],
        ].map(([v, r]) => (
          <Link
            key={v}
            href={`/app/agenda/indicadores?periodo=${v}`}
            className={`flex h-10 items-center justify-center rounded-lg text-sm font-semibold ${periodo.tipo === v ? "bg-royal-vivo text-white" : "text-suave"}`}
          >
            {r}
          </Link>
        ))}
        <span className="flex h-10 items-center justify-center text-xs text-suave">
          {formatarData(periodo.inicio).slice(0, 5)}–{formatarData(periodo.fim).slice(0, 5)}
        </span>
      </nav>
      <div className="grid grid-cols-2 gap-2">
        {cards.map((c) => (
          <Cartao key={c.rotulo} className="p-4">
            <p className="text-xs text-suave">{c.rotulo}</p>
            <p className={`numero mt-1 text-xl font-semibold ${c.cor}`}>{c.valor}</p>
          </Cartao>
        ))}
      </div>
      <p className="px-1 text-xs text-suave">
        {i.total} atendimentos no período · {i.compareceu} vieram · {i.faltou} faltaram. Comparecimento conta só atendimentos já marcados.
      </p>
      <Cartao className="p-4">
        <h2 className="text-base">Quem mais faltou</h2>
        {i.faltas_por_cliente.length ? (
          <ul className="mt-2 divide-y divide-borda text-sm">
            {i.faltas_por_cliente.map((f) => (
              <li key={f.cliente} className="flex justify-between py-2">
                <span className="text-tinta">{f.cliente}</span>
                <span className="numero font-semibold text-saida">{f.faltas}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-suave">Ninguém faltou no período.</p>
        )}
      </Cartao>
    </div>
  );
}
