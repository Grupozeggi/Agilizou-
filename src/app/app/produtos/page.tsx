import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Printer } from "lucide-react";
import { exigirCliente } from "@/lib/sessao";
import { listarProdutos } from "./dados";
import { ListaProdutos } from "./lista";

export const metadata: Metadata = { title: "Produtos e estoque" };

export default async function Produtos({ searchParams }: PageProps<"/app/produtos">) {
  const { supabase } = await exigirCliente();
  const [produtos, p] = await Promise.all([listarProdutos(supabase), searchParams]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl">Produtos</h1>
        <div className="flex gap-2">
          <Link
            href="/app/produtos/etiquetas"
            className="grid size-10 place-items-center rounded-xl border border-borda bg-white text-royal"
            aria-label="Imprimir etiquetas"
            title="Imprimir etiquetas"
          >
            <Printer className="size-4" />
          </Link>
          <Link
            href="/app/produtos/novo"
            className="inline-flex h-10 items-center gap-1 rounded-xl bg-royal-vivo px-4 text-sm font-semibold text-white"
          >
            <Plus className="size-4" /> Novo
          </Link>
        </div>
      </div>
      <ListaProdutos produtos={produtos} soBaixo={p.filtro === "baixo"} />
    </div>
  );
}
