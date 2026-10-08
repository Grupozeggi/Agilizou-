import type { Metadata } from "next";
import { Voltar } from "@/components/voltar";
import { termosDoNicho } from "@/config/nichos";
import { exigirCliente } from "@/lib/sessao";
import { ListaServicos, type Servico } from "./lista";

export const metadata: Metadata = { title: "Serviços" };

export default async function Servicos() {
  const { supabase, empresa } = await exigirCliente();
  const { data, error } = await supabase
    .from("servicos")
    .select("id, nome, preco_centavos, custo_centavos, duracao_minutos")
    .is("deleted_at", null)
    .order("nome")
    .returns<Servico[]>();
  if (error) throw new Error("Não foi possível carregar os serviços.");

  return (
    <div className="space-y-4">
      <Voltar href="/app/menu">Menu</Voltar>
      <h1 className="text-2xl">Serviços</h1>
      <p className="text-sm text-suave">
        O que você faz para o {termosDoNicho(empresa.nicho).cliente}, com preço e tempo. Usado nas vendas e na agenda.
      </p>
      <ListaServicos servicos={data} />
    </div>
  );
}
