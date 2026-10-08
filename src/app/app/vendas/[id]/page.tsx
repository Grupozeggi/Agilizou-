import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { Aviso, Cartao } from "@/components/ui";
import { Voltar } from "@/components/voltar";
import { formatarData } from "@/lib/datas";
import { formatarReais, multiplicar } from "@/lib/dinheiro";
import { formatarQuantidade } from "@/lib/estoque";
import { FORMAS_PAGAMENTO, type FormaPagamento } from "@/lib/lancamentos";
import { exigirCliente } from "@/lib/sessao";
import { CancelarVenda } from "./cancelar";

export const metadata: Metadata = { title: "Venda" };

type Venda = {
  id: string;
  numero: number;
  data: string;
  subtotal_centavos: number;
  desconto_centavos: number;
  total_centavos: number;
  custo_total_centavos: number;
  forma_pagamento: FormaPagamento;
  cliente: { nome: string } | null;
  itens: {
    id: string;
    descricao: string;
    quantidade: number;
    preco_unitario_centavos: number;
    custo_unitario_centavos: number;
    subtotal_centavos: number;
  }[];
};

export default async function DetalheVenda({ params, searchParams }: PageProps<"/app/vendas/[id]">) {
  const [{ id }, p] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase } = await exigirCliente();
  const { data: v } = await supabase
    .from("vendas")
    .select(
      "id, numero, data, subtotal_centavos, desconto_centavos, total_centavos, custo_total_centavos, forma_pagamento, cliente:clientes(nome), itens:itens_venda(id, descricao, quantidade, preco_unitario_centavos, custo_unitario_centavos, subtotal_centavos)",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<Venda>();
  if (!v) notFound();
  const lucro = v.total_centavos - v.custo_total_centavos;

  return (
    <div className="space-y-4">
      <Voltar href="/app/vendas">Vendas</Voltar>
      {p.nova && (
        <Aviso tipo="sucesso">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="size-4" /> Venda registrada! Estoque e caixa já foram atualizados.
          </span>
        </Aviso>
      )}
      <div>
        <h1 className="text-2xl">Venda #{v.numero}</h1>
        <p className="text-sm text-suave">
          {formatarData(v.data)} · {FORMAS_PAGAMENTO[v.forma_pagamento] ?? v.forma_pagamento}
          {v.cliente && ` · ${v.cliente.nome}`}
        </p>
      </div>
      <Cartao className="p-0">
        <ul className="divide-y divide-borda">
          {v.itens.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
              <span>
                <span className="block font-medium text-tinta">{i.descricao}</span>
                <span className="numero text-suave">
                  {formatarQuantidade(Number(i.quantidade))} × {formatarReais(i.preco_unitario_centavos)}
                </span>
              </span>
              <span className="numero font-semibold text-tinta">{formatarReais(i.subtotal_centavos)}</span>
            </li>
          ))}
        </ul>
      </Cartao>
      <Cartao className="space-y-1 p-4 text-sm">
        <Linha rotulo="Subtotal" valor={v.subtotal_centavos} />
        {v.desconto_centavos > 0 && <Linha rotulo="Desconto" valor={-v.desconto_centavos} />}
        <Linha rotulo="Total" valor={v.total_centavos} forte />
        <Linha
          rotulo="Custo"
          valor={-v.custo_total_centavos}
          ajuda={v.itens.map((i) => `${i.descricao}: ${formatarReais(multiplicar(i.custo_unitario_centavos, Number(i.quantidade)))}`).join(" · ")}
        />
        <div className="border-t border-borda pt-2">
          <Linha rotulo="Lucro da venda" valor={lucro} forte cor={lucro < 0 ? "text-saida" : "text-entrada"} />
        </div>
      </Cartao>
      <CancelarVenda id={v.id} numero={v.numero} />
    </div>
  );
}

function Linha({ rotulo, valor, forte, cor, ajuda }: { rotulo: string; valor: number; forte?: boolean; cor?: string; ajuda?: string }) {
  return (
    <div>
      <div className={`flex justify-between ${forte ? "font-semibold text-tinta" : "text-suave"}`}>
        <span>{rotulo}</span>
        <span className={`numero ${cor ?? ""}`}>{formatarReais(valor)}</span>
      </div>
      {ajuda && <p className="text-xs text-suave/80">{ajuda}</p>}
    </div>
  );
}
