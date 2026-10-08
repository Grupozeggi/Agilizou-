import "server-only";
import type { criarClienteServidor } from "@/lib/supabase/servidor";
import type { CategoriaOpcao } from "./form-lancamento";

type Supabase = Awaited<ReturnType<typeof criarClienteServidor>>;

export async function carregarCategorias(supabase: Supabase): Promise<CategoriaOpcao[]> {
  const { data, error } = await supabase
    .from("categorias")
    .select("id, nome, tipo")
    .is("deleted_at", null)
    .order("ordem")
    .order("nome")
    .returns<CategoriaOpcao[]>();
  if (error) throw new Error("Não foi possível carregar as categorias.");
  return data;
}

export async function carregarClientes(supabase: Supabase): Promise<{ id: string; nome: string }[]> {
  const { data } = await supabase.from("clientes").select("id, nome").is("deleted_at", null).order("nome").range(0, 1999);
  return data ?? [];
}
