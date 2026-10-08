import type { Metadata } from "next";
import { Voltar } from "@/components/voltar";
import { hojeIso } from "@/lib/datas";
import { usoLancamentos } from "@/lib/limites";
import { exigirCliente } from "@/lib/sessao";
import { carregarCategorias } from "../dados";
import { FormLancamento } from "../form-lancamento";

export const metadata: Metadata = { title: "Novo lançamento" };

export default async function NovoLancamento({ searchParams }: PageProps<"/app/lancamentos/novo">) {
  const { supabase, empresa } = await exigirCliente();
  const [categorias, uso, p] = await Promise.all([carregarCategorias(supabase), usoLancamentos(supabase, empresa), searchParams]);

  return (
    <div className="space-y-4">
      <Voltar href="/app/lancamentos">Lançamentos</Voltar>
      <h1 className="text-2xl">Novo lançamento</h1>
      <FormLancamento
        categorias={categorias}
        hoje={hojeIso()}
        tipoInicial={p.tipo === "saida" ? "saida" : "entrada"}
        avisoLimite={uso.mensagem}
      />
    </div>
  );
}
