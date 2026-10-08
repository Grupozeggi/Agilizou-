import type { Metadata } from "next";
import { Cartao } from "@/components/ui";
import { exigirAdmin } from "@/lib/sessao";

export const metadata: Metadata = { title: "Admin" };

export default async function PainelAdmin() {
  const { claims, supabase } = await exigirAdmin();
  const { count } = await supabase.from("empresas").select("id", { count: "exact", head: true });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl">Painel administrativo</h1>
      <Cartao>
        <p className="text-sm text-suave">Logado como {claims.email} (com 2FA).</p>
        <p className="numero mt-2 text-3xl font-semibold text-tinta">{count ?? 0}</p>
        <p className="text-sm text-suave">empresas cadastradas</p>
      </Cartao>
    </div>
  );
}
