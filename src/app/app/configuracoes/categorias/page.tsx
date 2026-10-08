import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Cartao } from "@/components/ui";
import { exigirCliente } from "@/lib/sessao";
import { LinhaCategoria, NovaCategoria } from "./componentes";

export const metadata: Metadata = { title: "Categorias" };

type Categoria = { id: string; nome: string; tipo: "entrada" | "saida"; grupo: "receita" | "custo" | "despesa" };

export default async function PaginaCategorias() {
  const { supabase } = await exigirCliente();
  const { data, error } = await supabase
    .from("categorias")
    .select("id, nome, tipo, grupo")
    .is("deleted_at", null)
    .order("ordem")
    .order("nome")
    .returns<Categoria[]>();

  if (error) throw new Error("Não foi possível carregar as categorias.");

  const secoes = [
    { titulo: "Entradas", ajuda: "O que entra de dinheiro.", itens: data.filter((c) => c.grupo === "receita") },
    { titulo: "Custos", ajuda: "Gastos ligados ao que você vende ou ao serviço.", itens: data.filter((c) => c.grupo === "custo") },
    { titulo: "Despesas", ajuda: "Gastos do dia a dia do negócio.", itens: data.filter((c) => c.grupo === "despesa") },
  ];

  return (
    <div className="space-y-4">
      <Link href="/app" className="inline-flex items-center gap-1 text-sm font-medium text-royal-vivo">
        <ChevronLeft className="size-4" /> Início
      </Link>
      <h1 className="text-2xl">Categorias</h1>

      {secoes.map((s) => (
        <Cartao key={s.titulo} className="p-0">
          <div className="border-b border-borda px-5 py-4">
            <h2 className="text-lg">{s.titulo}</h2>
            <p className="text-sm text-suave">{s.ajuda}</p>
          </div>
          {s.itens.length === 0 ? (
            <p className="px-5 py-4 text-sm text-suave">Nenhuma categoria ainda.</p>
          ) : (
            <ul className="divide-y divide-borda">
              {s.itens.map((c) => (
                <LinhaCategoria key={c.id} id={c.id} nome={c.nome} />
              ))}
            </ul>
          )}
        </Cartao>
      ))}

      <NovaCategoria />
    </div>
  );
}
