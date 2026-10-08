import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Voltar } from "@/components/voltar";
import { hojeIso } from "@/lib/datas";
import { exigirCliente } from "@/lib/sessao";
import { carregarCategorias } from "../dados";
import { FormLancamento, type LancamentoEditavel } from "../form-lancamento";

export const metadata: Metadata = { title: "Editar lançamento" };

export default async function EditarLancamento({ params }: PageProps<"/app/lancamentos/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const { supabase } = await exigirCliente();
  const [{ data: lancamento }, categorias] = await Promise.all([
    supabase
      .from("lancamentos")
      .select(
        "id, tipo, valor_centavos, categoria_id, data, status, forma_pagamento, descricao, observacao, grupo_id, parcela_numero, parcela_total, recorrente",
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle<LancamentoEditavel>(),
    carregarCategorias(supabase),
  ]);
  if (!lancamento) notFound();

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
      <FormLancamento categorias={categorias} hoje={hojeIso()} lancamento={lancamento} />
    </div>
  );
}
