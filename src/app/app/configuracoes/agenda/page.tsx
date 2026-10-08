import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Link2 } from "lucide-react";
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
      <Link href="/app/configuracoes/agendamento-online" className="flex min-h-16 items-center gap-3 rounded-cartao bg-white px-5 py-3 shadow-suave hover:bg-cartao">
        <Link2 className="size-5 text-royal" strokeWidth={1.75} />
        <span className="flex-1">
          <span className="block font-medium text-tinta">Link de agendamento</span>
          <span className="block text-sm text-suave">O cliente marca sozinho, nos dias e horários acima</span>
        </span>
        <ChevronRight className="size-5 text-suave" />
      </Link>
    </div>
  );
}
