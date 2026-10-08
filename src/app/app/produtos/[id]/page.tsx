import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Printer } from "lucide-react";
import { z } from "zod";
import { CodigoBarrasSvg } from "@/components/codigo-barras-svg";
import { Cartao } from "@/components/ui";
import { Voltar } from "@/components/voltar";
import { ehCodigoInterno } from "@/lib/codigo-barras";
import { formatarReais } from "@/lib/dinheiro";
import { estoqueBaixo, formatarQuantidade, margemProduto } from "@/lib/estoque";
import { exigirCliente } from "@/lib/sessao";
import { carregarCategorias } from "../../lancamentos/dados";
import { buscarProduto } from "../dados";
import { FormProduto } from "../form-produto";
import { ExcluirProduto, Movimentar } from "./componentes";

export const metadata: Metadata = { title: "Produto" };

const NOMES_MOV: Record<string, string> = { entrada: "Entrada", venda: "Venda", perda: "Perda", ajuste: "Ajuste" };

export default async function DetalheProduto({ params }: PageProps<"/app/produtos/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase } = await exigirCliente();
  const [produto, categorias, { data: movimentos }] = await Promise.all([
    buscarProduto(supabase, id),
    carregarCategorias(supabase),
    supabase
      .from("movimentacoes_estoque")
      .select("id, tipo, quantidade, observacao, criado_em, venda_id")
      .eq("produto_id", id)
      .order("criado_em", { ascending: false })
      .limit(30),
  ]);
  if (!produto) notFound();

  const baixo = estoqueBaixo(produto.estoque, produto.estoque_minimo);
  const m = margemProduto(produto.preco_centavos, produto.custo_centavos);

  return (
    <div className="space-y-4">
      <Voltar href="/app/produtos">Produtos</Voltar>
      <div>
        <p className="numero text-sm text-suave">Código #{String(produto.codigo).padStart(4, "0")}</p>
        <h1 className="text-2xl">{produto.nome}</h1>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Cartao className={`p-4 ${baixo ? "ring-1 ring-saida/40" : ""}`}>
          <p className="text-xs text-suave">Em estoque</p>
          <p className={`numero text-2xl font-semibold ${baixo ? "text-saida" : "text-tinta"}`}>
            {formatarQuantidade(produto.estoque, produto.unidade)}
          </p>
          {baixo ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-saida">
              <AlertTriangle className="size-3.5" /> Estoque baixo (mínimo {formatarQuantidade(produto.estoque_minimo)})
            </p>
          ) : (
            produto.estoque_minimo > 0 && <p className="mt-1 text-xs text-suave">Mínimo: {formatarQuantidade(produto.estoque_minimo)}</p>
          )}
        </Cartao>
        <Cartao className="p-4">
          <p className="text-xs text-suave">Margem por unidade</p>
          <p className={`numero text-2xl font-semibold ${m.valor < 0 ? "text-saida" : "text-tinta"}`}>{formatarReais(m.valor)}</p>
          <p className="mt-1 text-xs text-suave">
            {formatarReais(produto.preco_centavos)} − {formatarReais(produto.custo_centavos)}
            {m.percentual !== null && ` · ${m.percentual.toLocaleString("pt-BR")}%`}
          </p>
        </Cartao>
      </div>

      <Movimentar
        produtoId={produto.id}
        custoAtual={produto.custo_centavos}
        estoqueAtual={produto.estoque}
        categoriasSaida={categorias.filter((c) => c.tipo === "saida")}
      />

      <Cartao className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base">Código de barras</h2>
            <p className="text-xs text-suave">{ehCodigoInterno(produto.codigo_barras) ? "Gerado pelo Agilizou" : "Da embalagem"}</p>
          </div>
          <Link
            href={`/app/produtos/etiquetas?id=${produto.id}`}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-borda px-3 text-sm font-semibold text-royal"
          >
            <Printer className="size-4" /> Etiquetas
          </Link>
        </div>
        <CodigoBarrasSvg codigo={produto.codigo_barras} className="mt-3 h-24 w-full max-w-xs" />
      </Cartao>

      <Cartao className="p-4">
        <h2 className="text-base">Histórico do estoque</h2>
        {movimentos?.length ? (
          <ul className="mt-2 divide-y divide-borda text-sm">
            {movimentos.map((mv) => {
              const q = Number(mv.quantidade);
              return (
                <li key={mv.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="font-medium text-tinta">{NOMES_MOV[mv.tipo]}</span>
                    <span className="block truncate text-xs text-suave">
                      {new Date(mv.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}
                      {mv.observacao && ` · ${mv.observacao}`}
                    </span>
                  </span>
                  <span className={`numero font-semibold ${q < 0 ? "text-saida" : "text-entrada"}`}>
                    {q > 0 ? "+" : ""}
                    {formatarQuantidade(q, produto.unidade)}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-suave">Nenhuma movimentação ainda.</p>
        )}
      </Cartao>

      <details className="rounded-cartao bg-white p-4 shadow-suave">
        <summary className="cursor-pointer font-semibold text-tinta">Editar produto</summary>
        <div className="mt-4">
          <FormProduto
            inicial={{
              ...produto,
              codigo_interno: ehCodigoInterno(produto.codigo_barras),
            }}
          />
        </div>
      </details>

      <ExcluirProduto id={produto.id} nome={produto.nome} />
    </div>
  );
}
