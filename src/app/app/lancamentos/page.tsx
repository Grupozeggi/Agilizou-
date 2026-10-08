import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Cartao } from "@/components/ui";
import { formatarData, hojeIso } from "@/lib/datas";
import { formatarReais, somar } from "@/lib/dinheiro";
import { FORMAS_PAGAMENTO, limitesDoMes, maiuscula, nomeDoMes, somarMeses, type FormaPagamento } from "@/lib/lancamentos";
import { exigirCliente } from "@/lib/sessao";

export const metadata: Metadata = { title: "Lançamentos" };

type Linha = {
  id: string;
  tipo: "entrada" | "saida";
  valor_centavos: number;
  data: string;
  status: "pago" | "pendente";
  descricao: string | null;
  forma_pagamento: FormaPagamento | null;
  parcela_numero: number | null;
  parcela_total: number | null;
  categoria: { nome: string } | null;
};

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export default async function Lancamentos({ searchParams }: PageProps<"/app/lancamentos">) {
  const p = await searchParams;
  const hoje = hojeIso();
  const mes = typeof p.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(p.mes) ? p.mes : hoje.slice(0, 7);
  const filtro = p.tipo === "entrada" || p.tipo === "saida" ? p.tipo : null;
  const { inicio, fim } = limitesDoMes(`${mes}-01`);

  const { supabase } = await exigirCliente();
  let consulta = supabase
    .from("lancamentos")
    .select(
      "id, tipo, valor_centavos, data, status, descricao, forma_pagamento, parcela_numero, parcela_total, categoria:categorias(nome)",
    )
    .is("deleted_at", null)
    .gte("data", inicio)
    .lte("data", fim)
    .order("data", { ascending: false })
    .order("criado_em", { ascending: false })
    .range(0, 4999);
  if (filtro) consulta = consulta.eq("tipo", filtro);
  const { data, error } = await consulta.returns<Linha[]>();
  if (error) throw new Error("Não foi possível carregar os lançamentos.");

  const pagos = data.filter((l) => l.status === "pago");
  const entrou = somar(pagos.filter((l) => l.tipo === "entrada").map((l) => l.valor_centavos));
  const saiu = somar(pagos.filter((l) => l.tipo === "saida").map((l) => l.valor_centavos));

  const porDia = new Map<string, Linha[]>();
  for (const l of data) porDia.set(l.data, [...(porDia.get(l.data) ?? []), l]);

  const link = (m: string, t = filtro) => `/app/lancamentos?mes=${m}${t ? `&tipo=${t}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl">Lançamentos</h1>
        <Link
          href="/app/lancamentos/novo"
          className="inline-flex h-10 items-center gap-1 rounded-xl bg-royal-vivo px-4 text-sm font-semibold text-white"
        >
          <Plus className="size-4" /> Lançar
        </Link>
      </div>

      <div className="flex items-center justify-between rounded-xl bg-white px-2 py-1 shadow-suave">
        <Link href={link(somarMeses(`${mes}-01`, -1).slice(0, 7))} className="grid size-11 place-items-center text-royal" aria-label="Mês anterior">
          <ChevronLeft className="size-5" />
        </Link>
        <span className="font-semibold text-tinta">{maiuscula(nomeDoMes(mes))}</span>
        <Link href={link(somarMeses(`${mes}-01`, 1).slice(0, 7))} className="grid size-11 place-items-center text-royal" aria-label="Próximo mês">
          <ChevronRight className="size-5" />
        </Link>
      </div>

      <Cartao className="grid grid-cols-3 gap-2 p-4 text-center">
        <Resumo rotulo="Entrou" valor={entrou} cor="text-entrada" />
        <Resumo rotulo="Saiu" valor={saiu} cor="text-saida" />
        <Resumo rotulo="Sobrou" valor={entrou - saiu} cor={entrou - saiu < 0 ? "text-saida" : "text-tinta"} />
      </Cartao>

      <div className="flex gap-2 text-sm">
        {(
          [
            [null, "Todos"],
            ["entrada", "Entradas"],
            ["saida", "Saídas"],
          ] as const
        ).map(([t, rotulo]) => (
          <Link
            key={rotulo}
            href={link(mes, t)}
            className={`rounded-full border px-4 py-2 font-medium ${filtro === t ? "border-royal-vivo bg-royal-claro text-royal" : "border-borda text-suave"}`}
          >
            {rotulo}
          </Link>
        ))}
      </div>

      {data.length === 0 ? (
        <Cartao className="text-center text-suave">
          Nenhum lançamento em {nomeDoMes(mes)}.{" "}
          <Link href="/app/lancamentos/novo" className="font-semibold text-royal-vivo underline">
            Lançar agora
          </Link>
        </Cartao>
      ) : (
        [...porDia.entries()].map(([dia, itens]) => (
          <section key={dia}>
            <h2 className="mb-2 px-1 text-sm font-medium text-suave">
              {dia === hoje ? "Hoje" : `${DIAS_SEMANA[new Date(`${dia}T12:00:00Z`).getUTCDay()]}, ${formatarData(dia)}`}
            </h2>
            <ul className="divide-y divide-borda overflow-hidden rounded-cartao bg-white shadow-suave">
              {itens.map((l) => (
                <li key={l.id}>
                  <Link href={`/app/lancamentos/${l.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-cartao">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-tinta">
                        {l.descricao || l.categoria?.nome || (l.tipo === "entrada" ? "Entrada" : "Saída")}
                      </span>
                      <span className="block truncate text-sm text-suave">
                        {[
                          l.descricao ? l.categoria?.nome : null,
                          l.parcela_total ? `${l.parcela_numero}/${l.parcela_total}` : null,
                          l.forma_pagamento ? FORMAS_PAGAMENTO[l.forma_pagamento] : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className={`numero block font-semibold ${l.tipo === "entrada" ? "text-entrada" : "text-saida"}`}>
                        {l.tipo === "entrada" ? "+" : "−"} {formatarReais(l.valor_centavos)}
                      </span>
                      {l.status === "pendente" && (
                        <span className="text-xs font-medium text-suave">
                          {l.tipo === "entrada" ? "a receber" : "a pagar"}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function Resumo({ rotulo, valor, cor }: { rotulo: string; valor: number; cor: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-suave">{rotulo}</p>
      <p className={`numero truncate text-sm font-semibold sm:text-base ${cor}`}>{formatarReais(valor)}</p>
    </div>
  );
}
