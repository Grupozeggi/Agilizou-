import type { Metadata } from "next";
import { Cartao } from "@/components/ui";
import { Voltar } from "@/components/voltar";
import { hojeIso } from "@/lib/datas";
import { exigirCliente } from "@/lib/sessao";
import { FormLembrete } from "./form-lembrete";

export const metadata: Metadata = { title: "Novo lembrete" };

export default async function NovoLembrete() {
  const { supabase } = await exigirCliente();
  const { data: clientes } = await supabase.from("clientes").select("id, nome").is("deleted_at", null).order("nome").range(0, 1999);
  return (
    <div className="space-y-4">
      <Voltar href="/app/hoje">Hoje</Voltar>
      <h1 className="text-2xl">Novo lembrete</h1>
      <Cartao>
        <FormLembrete hoje={hojeIso()} clientes={clientes ?? []} />
      </Cartao>
    </div>
  );
}
