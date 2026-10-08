import "server-only";
import type { criarClienteServidor } from "@/lib/supabase/servidor";

type Supabase = Awaited<ReturnType<typeof criarClienteServidor>>;

export type Produto = {
  id: string;
  codigo: number;
  codigo_barras: string;
  nome: string;
  unidade: string;
  custo_centavos: number;
  preco_centavos: number;
  estoque: number;
  estoque_minimo: number;
};

const CAMPOS = "id, codigo, codigo_barras, nome, unidade, custo_centavos, preco_centavos, estoque, estoque_minimo";

/** numeric do Postgres chega como string: converte para número. */
function normalizar(p: Produto): Produto {
  return { ...p, codigo: Number(p.codigo), estoque: Number(p.estoque), estoque_minimo: Number(p.estoque_minimo) };
}

export async function listarProdutos(supabase: Supabase): Promise<Produto[]> {
  const { data, error } = await supabase
    .from("produtos")
    .select(CAMPOS)
    .is("deleted_at", null)
    .order("nome")
    .range(0, 4999)
    .returns<Produto[]>();
  if (error) throw new Error("Não foi possível carregar os produtos.");
  return data.map(normalizar);
}

export async function buscarProduto(supabase: Supabase, id: string): Promise<Produto | null> {
  const { data } = await supabase.from("produtos").select(CAMPOS).eq("id", id).is("deleted_at", null).maybeSingle<Produto>();
  return data ? normalizar(data) : null;
}
