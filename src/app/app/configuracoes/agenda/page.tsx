import type { Metadata } from "next";
import { Voltar } from "@/components/voltar";
import { exigirCliente } from "@/lib/sessao";
import { FormConfigAgenda } from "./form";

export const metadata: Metadata = { title: "Agenda" };

export default async function ConfigAgenda() {
  const { supabase, empresa } = await exigirCliente();
  const { data } = await supabase.from("empresas").select("agenda_ativa, horario_abertura, horario_fechamento, dias_funcionamento").eq("id", empresa.id).single();
  return (
    <div className="space-y-4">
      <Voltar href="/app/configuracoes">Ajustes</Voltar>
      <h1 className="text-2xl">Agenda de atendimentos</h1>
      <FormConfigAgenda
        inicial={{
          agenda_ativa: data?.agenda_ativa ?? false,
          abertura: (data?.horario_abertura ?? "08:00").slice(0, 5),
          fechamento: (data?.horario_fechamento ?? "18:00").slice(0, 5),
          dias: (data?.dias_funcionamento as number[]) ?? [1, 2, 3, 4, 5, 6],
        }}
      />
    </div>
  );
}
