import type { Metadata } from "next";
import { Voltar } from "@/components/voltar";
import { termosDoNicho } from "@/config/nichos";
import { hojeIso, somarDias } from "@/lib/datas";
import { exigirCliente } from "@/lib/sessao";
import { atendimentosEntre, cadastrosAgenda } from "../dados";
import { FormAgendamento } from "./form";

export const metadata: Metadata = { title: "Agendar" };

export default async function NovoAgendamento({ searchParams }: PageProps<"/app/agenda/novo">) {
  const p = await searchParams;
  const { supabase, empresa } = await exigirCliente();
  const hoje = hojeIso();
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  // Carrega 60 dias de ocupação para mostrar horários livres sem recarregar.
  const [cad, ocupados] = await Promise.all([cadastrosAgenda(supabase), atendimentosEntre(supabase, hoje, somarDias(hoje, 60))]);

  return (
    <div className="space-y-4">
      <Voltar href="/app/agenda">Agenda</Voltar>
      <h1 className="text-2xl">Agendar</h1>
      <FormAgendamento
        cadastros={cad}
        termos={termosDoNicho(empresa.nicho)}
        hoje={hoje}
        ocupados={ocupados
          .filter((a) => a.status !== "cancelado" && a.status !== "remarcado")
          .map((a) => ({ profissional: a.profissional?.id ?? "", inicio: a.inicio, fim: a.fim }))}
        inicial={{ dia: str(p.dia), hora: str(p.hora), profissional: str(p.profissional), cliente: str(p.cliente) }}
      />
    </div>
  );
}
