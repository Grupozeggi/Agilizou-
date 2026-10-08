import type { Metadata } from "next";
import { Cartao } from "@/components/ui";
import { Voltar } from "@/components/voltar";
import { termosDoNicho } from "@/config/nichos";
import { usoCadastro } from "@/lib/limites";
import { exigirCliente } from "@/lib/sessao";
import { FormCliente } from "../form-cliente";

export const metadata: Metadata = { title: "Novo cliente" };

export default async function NovoCliente({ searchParams }: PageProps<"/app/clientes/novo">) {
  const { supabase, empresa } = await exigirCliente();
  const [uso, p] = await Promise.all([usoCadastro(supabase, empresa, "clientes"), searchParams]);
  const t = termosDoNicho(empresa.nicho);
  const voltar = typeof p.voltar === "string" && p.voltar.startsWith("/app/") ? p.voltar : undefined;
  return (
    <div className="space-y-4">
      <Voltar href={voltar?.split("?")[0] ?? "/app/clientes"}>Voltar</Voltar>
      <h1 className="text-2xl">Novo {t.cliente}</h1>
      <Cartao>
        <FormCliente termo={t.cliente} voltar={voltar} avisoLimite={uso.mensagem} />
      </Cartao>
    </div>
  );
}
