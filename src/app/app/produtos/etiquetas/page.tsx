import type { Metadata } from "next";
import { z } from "zod";
import { CodigoBarrasSvg } from "@/components/codigo-barras-svg";
import { Voltar } from "@/components/voltar";
import { formatarReais } from "@/lib/dinheiro";
import { exigirCliente } from "@/lib/sessao";
import { listarProdutos } from "../dados";
import { BotaoImprimir } from "./imprimir";

export const metadata: Metadata = { title: "Etiquetas" };

/**
 * Folha de etiquetas para imprimir (A4, 3 colunas). Cada etiqueta tem
 * nome, preço e código de barras. Use ?id=...&qtd=... para um produto só.
 */
export default async function Etiquetas({ searchParams }: PageProps<"/app/produtos/etiquetas">) {
  const p = await searchParams;
  const { supabase } = await exigirCliente();
  const todos = await listarProdutos(supabase);
  const id = typeof p.id === "string" && z.uuid().safeParse(p.id).success ? p.id : null;
  const qtd = Math.min(Math.max(Number(p.qtd) || (id ? 12 : 1), 1), 300);
  const selecionados = id ? todos.filter((x) => x.id === id) : todos;
  const etiquetas = selecionados.flatMap((prod) => Array.from({ length: qtd }, (_, i) => ({ prod, i })));

  return (
    <div className="space-y-4">
      <div className="space-y-3 print:hidden">
        <Voltar href={id ? `/app/produtos/${id}` : "/app/produtos"}>Voltar</Voltar>
        <h1 className="text-2xl">Etiquetas</h1>
        <form className="flex items-end gap-2">
          {id && <input type="hidden" name="id" value={id} />}
          <label className="text-sm text-tinta">
            {id ? "Quantas etiquetas?" : "Etiquetas por produto"}
            <input
              type="number"
              name="qtd"
              min={1}
              max={300}
              defaultValue={qtd}
              className="mt-1 block h-11 w-28 rounded-xl border border-borda bg-white px-3"
            />
          </label>
          <button type="submit" className="h-11 rounded-xl border border-borda bg-white px-4 text-sm font-semibold text-royal">
            Atualizar
          </button>
          <BotaoImprimir />
        </form>
        <p className="text-sm text-suave">
          {etiquetas.length} etiqueta(s). Dica: na impressão, escolha “Salvar como PDF” para guardar o arquivo.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 print:grid-cols-3 print:gap-1">
        {etiquetas.map(({ prod, i }) => (
          <div key={`${prod.id}-${i}`} className="break-inside-avoid rounded-lg border border-borda bg-white p-2 text-center print:rounded-none">
            <p className="truncate text-xs font-semibold text-black">{prod.nome}</p>
            <p className="numero text-sm font-bold text-black">{formatarReais(prod.preco_centavos)}</p>
            <CodigoBarrasSvg codigo={prod.codigo_barras} altura={40} className="mx-auto h-16 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
