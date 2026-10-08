import type { Metadata } from "next";
import { Voltar } from "@/components/voltar";
import { validarCodigoInformado } from "@/lib/codigo-barras";
import { usoCadastro } from "@/lib/limites";
import { exigirCliente } from "@/lib/sessao";
import { FormProduto } from "../form-produto";

export const metadata: Metadata = { title: "Novo produto" };

export default async function NovoProduto({ searchParams }: PageProps<"/app/produtos/novo">) {
  const { supabase, empresa } = await exigirCliente();
  const [uso, p] = await Promise.all([usoCadastro(supabase, empresa, "produtos"), searchParams]);
  const codigo = typeof p.codigo === "string" ? validarCodigoInformado(p.codigo) : null;

  return (
    <div className="space-y-4">
      <Voltar href="/app/produtos">Produtos</Voltar>
      <h1 className="text-2xl">Novo produto</h1>
      <FormProduto inicial={{ codigo_barras: codigo?.ok ? codigo.codigo : undefined }} avisoLimite={uso.mensagem} />
    </div>
  );
}
