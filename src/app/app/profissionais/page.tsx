import type { Metadata } from "next";
import { Voltar } from "@/components/voltar";
import { termosDoNicho } from "@/config/nichos";
import { usoCadastro } from "@/lib/limites";
import { exigirCliente } from "@/lib/sessao";
import { ListaProfissionais } from "./lista";

export const metadata: Metadata = { title: "Profissionais" };

export default async function Profissionais() {
  const { supabase, empresa } = await exigirCliente();
  const t = termosDoNicho(empresa.nicho);
  const [{ data }, uso] = await Promise.all([
    supabase.from("profissionais").select("id, nome").is("deleted_at", null).order("nome"),
    usoCadastro(supabase, empresa, "profissionais"),
  ]);
  return (
    <div className="space-y-4">
      <Voltar href="/app/agenda">Agenda</Voltar>
      <h1 className="text-2xl capitalize">{t.profissionais}</h1>
      <p className="text-sm text-suave">
        Quem atende na agenda. Seu plano permite {uso.limite} ({uso.usado} em uso).
      </p>
      <ListaProfissionais profissionais={data ?? []} termo={t.profissional} />
    </div>
  );
}
