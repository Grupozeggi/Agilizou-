import type { Metadata } from "next";
import { Voltar } from "@/components/voltar";
import { hojeIso } from "@/lib/datas";
import { exigirCliente } from "@/lib/sessao";
import { carregarCategorias } from "../../lancamentos/dados";
import { listarProdutos } from "../../produtos/dados";
import { Carrinho } from "./carrinho";

export const metadata: Metadata = { title: "Nova venda" };

export default async function NovaVenda({ searchParams }: PageProps<"/app/vendas/nova">) {
  const p = await searchParams;
  const { supabase } = await exigirCliente();
  const agendamentoId = typeof p.agendamento === "string" && /^[0-9a-f-]{36}$/i.test(p.agendamento) ? p.agendamento : null;
  const agendamento = agendamentoId
    ? (
        await supabase
          .from("agendamentos")
          .select("id, cliente_id, servico_id, venda_id")
          .eq("id", agendamentoId)
          .is("deleted_at", null)
          .maybeSingle()
      ).data
    : null;
  const [produtos, categorias, servicos, clientes] = await Promise.all([
    listarProdutos(supabase),
    carregarCategorias(supabase),
    supabase
      .from("servicos")
      .select("id, nome, preco_centavos, custo_centavos")
      .is("deleted_at", null)
      .order("nome")
      .then((r) => r.data ?? []),
    supabase
      .from("clientes")
      .select("id, nome")
      .is("deleted_at", null)
      .order("nome")
      .range(0, 1999)
      .then((r) => r.data ?? []),
  ]);
  const receitas = categorias.filter((c) => c.tipo === "entrada");
  // Categoria padrão: a que tem cara de venda; senão a primeira de entrada.
  const padrao =
    receitas.find((c) => /venda|peça/i.test(c.nome)) ?? receitas.find((c) => /servi/i.test(c.nome)) ?? receitas[0];

  return (
    <div className="space-y-4">
      <Voltar href="/app/vendas">Vendas</Voltar>
      <h1 className="text-2xl">Nova venda</h1>
      <Carrinho
        produtos={produtos}
        servicos={servicos}
        categorias={receitas}
        categoriaPadrao={padrao?.id ?? null}
        clientes={clientes}
        hoje={hojeIso()}
        agendamento={agendamento && !agendamento.venda_id ? agendamento : null}
      />
    </div>
  );
}
