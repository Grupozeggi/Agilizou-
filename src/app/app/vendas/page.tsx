import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Cartao } from "@/components/ui";
import { formatarData, hojeIso } from "@/lib/datas";
import { formatarReais, somar } from "@/lib/dinheiro";
import { FORMAS_PAGAMENTO, limitesDoMes, nomeDoMes, somarMeses, type FormaPagamento } from "@/lib/lancamentos";
import { exigirCliente } from "@/lib/sessao";

export const metadata: Metadata = { title: "Vendas" };

type Venda = {
  id: string;
  numero: number;
  data: string;
  total_centavos: number;
  custo_total_centavos: number;
  forma_pagamento: FormaPagamento;
  cliente: { nome: string } | null;
  itens: { descricao: string }[];
};

export default async function Vendas({ searchParams }: PageProps<"/app/vendas">) {
  const p = await searchParams;
  const hoje = hojeIso();
  const mes = typeof p.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(p.mes) ? p.mes : hoje.slice(0, 7);
  const { inicio, fim } = limitesDoMes(`${mes}-01`);
  const { supabase } = await exigirCliente();

  const { data, error } = await supabase
    .from("vendas")
    .select("id, numero, data, total_centavos, custo_total_centavos, forma_pagamento, cliente:clientes(nome), itens:itens_venda(descricao)")
    .is("deleted_at", null)
    .gte("data", inicio)
    .lte("data", fim)
    .order("data", { ascending: false })
    .order("numero", { ascending: false })
    .range(0, 1999)
    .returns<Venda[]>();
  if (error) throw new Error("Não foi possível carregar as vendas.");

  const total = somar(data.map((v) => v.total_centavos));
  const lucro = total - somar(data.map((v) => v.custo_total_centavos));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl">Vendas</h1>
        <Link href="/app/vendas/nova" className="inline-flex h-10 items-center gap-1 rounded-xl bg-royal-vivo px-4 text-sm font-semibold text-white">
          <Plus className="size-4" /> Vender
        </Link>
      </div>

      <div className="flex items-center justify-between rounded-xl bg-white px-2 py-1 shadow-suave">
        <Link href={`/app/vendas?mes=${somarMeses(`${mes}-01`, -1).slice(0, 7)}`} className="grid size-11 place-items-center text-royal" aria-label="Mês anterior">
          <ChevronLeft className="size-5" />
        </Link>
        <span className="font-semibold capitalize text-tinta">{nomeDoMes(mes)}</span>
        <Link href={`/app/vendas?mes=${somarMeses(`${mes}-01`, 1).slice(0, 7)}`} className="grid size-11 place-items-center text-royal" aria-label="Próximo mês">
          <ChevronRight className="size-5" />
        </Link>
      </div>

      <Cartao className="grid grid-cols-3 gap-2 p-4 text-center">
        <div>
          <p className="text-xs text-suave">Vendas</p>
          <p className="numero font-semibold text-tinta">{data.length}</p>
        </div>
        <div>
          <p className="text-xs text-suave">Vendido</p>
          <p className="numero truncate text-sm font-semibold text-entrada">{formatarReais(total)}</p>
        </div>
        <div>
          <p className="text-xs text-suave">Lucro</p>
          <p className={`numero truncate text-sm font-semibold ${lucro < 0 ? "text-saida" : "text-tinta"}`}>{formatarReais(lucro)}</p>
        </div>
      </Cartao>

      {data.length === 0 ? (
        <Cartao className="text-center text-suave">Nenhuma venda em {nomeDoMes(mes)}.</Cartao>
      ) : (
        <ul className="divide-y divide-borda overflow-hidden rounded-cartao bg-white shadow-suave">
          {data.map((v) => {
            const l = v.total_centavos - v.custo_total_centavos;
            return (
              <li key={v.id}>
                <Link href={`/app/vendas/${v.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-cartao">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-tinta">
                      #{v.numero} · {v.itens.map((i) => i.descricao).join(", ")}
                    </span>
                    <span className="block truncate text-sm text-suave">
                      {formatarData(v.data)} · {FORMAS_PAGAMENTO[v.forma_pagamento] ?? v.forma_pagamento}
                      {v.cliente && ` · ${v.cliente.nome}`}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="numero block font-semibold text-entrada">{formatarReais(v.total_centavos)}</span>
                    <span className={`numero text-xs ${l < 0 ? "text-saida" : "text-suave"}`}>lucro {formatarReais(l)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
