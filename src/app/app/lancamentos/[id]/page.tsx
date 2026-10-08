import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { Voltar } from "@/components/voltar";
import { hojeIso } from "@/lib/datas";
import { exigirCliente } from "@/lib/sessao";
import { carregarCategorias, carregarClientes } from "../dados";
import { FormLancamento, type LancamentoEditavel } from "../form-lancamento";

export const metadata: Metadata = { title: "Editar lançamento" };

export default async function EditarLancamento({ params }: PageProps<"/app/lancamentos/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const { supabase } = await exigirCliente();
  const [{ data: lancamento }, categorias, clientes] = await Promise.all([
    supabase
      .from("lancamentos")
      .select(
        "id, tipo, valor_centavos, categoria_id, data, status, forma_pagamento, descricao, observacao, grupo_id, parcela_numero, parcela_total, recorrente, venda_id, cliente_id",
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle<LancamentoEditavel & { venda_id: string | null }>(),
    carregarCategorias(supabase),
    carregarClientes(supabase),
  ]);
  if (!lancamento) notFound();
  // Entrada gerada por venda é editada pela própria venda (cancelar e lançar de novo).
  if (lancamento.venda_id) redirect(`/app/vendas/${lancamento.venda_id}`);

  // Categoria removida depois do lançamento continua aparecendo para ele.
  if (lancamento.categoria_id && !categorias.some((c) => c.id === lancamento.categoria_id)) {
    const { data: antiga } = await supabase
      .from("categorias")
      .select("id, nome, tipo")
      .eq("id", lancamento.categoria_id)
      .maybeSingle();
    if (antiga) categorias.push(antiga);
  }

  return (
    <div className="space-y-4">
      <Voltar href={`/app/lancamentos?mes=${lancamento.data.slice(0, 7)}`}>Lançamentos</Voltar>
      <h1 className="text-2xl">{lancamento.tipo === "entrada" ? "Editar entrada" : "Editar saída"}</h1>
      <FormLancamento categorias={categorias} hoje={hojeIso()} lancamento={lancamento} clientes={clientes} />
    </div>
  );
}
