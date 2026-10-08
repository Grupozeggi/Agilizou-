import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircleOff, Plus } from "lucide-react";
import { Cartao } from "@/components/ui";
import { termosDoNicho } from "@/config/nichos";
import { formatarWhatsapp } from "@/lib/mensagens";
import { exigirCliente } from "@/lib/sessao";

export const metadata: Metadata = { title: "Clientes" };

export default async function Clientes({ searchParams }: PageProps<"/app/clientes">) {
  const p = await searchParams;
  const busca = typeof p.q === "string" ? p.q.trim().slice(0, 60) : "";
  const { supabase, empresa } = await exigirCliente();
  const t = termosDoNicho(empresa.nicho);
  let q = supabase.from("clientes").select("id, nome, whatsapp, aceita_mensagens").is("deleted_at", null).order("nome").range(0, 999);
  if (busca) {
    const digitos = busca.replace(/\D/g, "");
    q = digitos.length >= 4 ? q.ilike("whatsapp", `%${digitos}%`) : q.ilike("nome", `%${busca.replace(/[%_]/g, "")}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error("Não foi possível carregar.");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl capitalize">{t.clientes}</h1>
        <Link href="/app/clientes/novo" className="inline-flex h-10 items-center gap-1 rounded-xl bg-royal-vivo px-4 text-sm font-semibold text-white">
          <Plus className="size-4" /> Novo
        </Link>
      </div>
      <form>
        <input
          name="q"
          defaultValue={busca}
          placeholder="Buscar por nome ou telefone"
          className="h-12 w-full rounded-xl border border-borda bg-white px-4 text-base outline-none focus:border-royal-vivo"
        />
      </form>
      {data.length === 0 ? (
        <Cartao className="text-center text-suave">{busca ? "Ninguém encontrado." : `Nenhum ${t.cliente} cadastrado ainda.`}</Cartao>
      ) : (
        <ul className="divide-y divide-borda overflow-hidden rounded-cartao bg-white shadow-suave">
          {data.map((c) => (
            <li key={c.id}>
              <Link href={`/app/clientes/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-cartao">
                <span className="font-medium text-tinta">{c.nome}</span>
                <span className="flex items-center gap-2 text-sm text-suave">
                  {c.whatsapp ? formatarWhatsapp(c.whatsapp) : "sem WhatsApp"}
                  {!c.aceita_mensagens && <MessageCircleOff className="size-4" aria-label="Não recebe mensagens" />}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
