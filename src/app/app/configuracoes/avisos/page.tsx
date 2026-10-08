import type { Metadata } from "next";
import { Voltar } from "@/components/voltar";
import { exigirCliente } from "@/lib/sessao";
import { FormAvisos } from "./form";

export const metadata: Metadata = { title: "Avisos" };

export default async function Avisos() {
  const { supabase, empresa } = await exigirCliente();
  const { data } = await supabase
    .from("empresas")
    .select("aviso_email, aviso_push, aviso_no_dia, aviso_dias_antes")
    .eq("id", empresa.id)
    .single();
  return (
    <div className="space-y-4">
      <Voltar href="/app/configuracoes">Ajustes</Voltar>
      <h1 className="text-2xl">Avisos de vencimento</h1>
      <p className="text-sm text-suave">Avisamos sobre contas a pagar, a receber e lembretes, todo dia às 8h.</p>
      <FormAvisos inicial={data ?? { aviso_email: true, aviso_push: true, aviso_no_dia: true, aviso_dias_antes: 1 }} chavePublica={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />
    </div>
  );
}
