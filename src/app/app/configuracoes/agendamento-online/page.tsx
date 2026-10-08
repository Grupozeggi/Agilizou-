import type { Metadata } from "next";
import Link from "next/link";
import { Aviso } from "@/components/ui";
import { Voltar } from "@/components/voltar";
import { termosDoNicho } from "@/config/nichos";
import { urlDoSite } from "@/lib/env";
import { exigirCliente } from "@/lib/sessao";
import { FormAgendamentoOnline } from "./form";

export const metadata: Metadata = { title: "Link de agendamento" };

export default async function AgendamentoOnline() {
  const { supabase, empresa } = await exigirCliente();
  const t = termosDoNicho(empresa.nicho);
  const [{ data: e }, { count: profissionais }, { count: servicos }] = await Promise.all([
    supabase
      .from("empresas")
      .select(
        "slug, agendamento_online, agendamento_dias_adiante, agendamento_antecedencia_horas, agendamento_mostrar_precos, agendamento_mensagem, datas_fechadas, horario_abertura, horario_fechamento, dias_funcionamento",
      )
      .eq("id", empresa.id)
      .single(),
    supabase.from("profissionais").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("ativo", true),
    supabase.from("servicos").select("id", { count: "exact", head: true }).is("deleted_at", null),
  ]);

  return (
    <div className="space-y-4">
      <Voltar href="/app/agenda">Agenda</Voltar>
      <div>
        <h1 className="text-2xl">Link de agendamento</h1>
        <p className="mt-1 text-sm text-suave">
          Envie o link e o {t.cliente} escolhe o dia e o horário sozinho. O horário entra direto na sua agenda.
        </p>
      </div>

      {!empresa.agenda_ativa && (
        <Aviso tipo="info">
          A agenda de atendimentos está desligada.{" "}
          <Link href="/app/configuracoes/agenda" className="font-semibold underline">
            Ligar a agenda
          </Link>
        </Aviso>
      )}
      {empresa.agenda_ativa && !profissionais && (
        <Aviso tipo="info">
          Cadastre pelo menos um {t.profissional} para o link mostrar horários.{" "}
          <Link href="/app/profissionais" className="font-semibold underline">
            Cadastrar
          </Link>
        </Aviso>
      )}
      {empresa.agenda_ativa && !servicos && (
        <Aviso tipo="info">
          Sem serviços cadastrados, cada horário marcado pelo link dura 30 minutos.{" "}
          <Link href="/app/servicos" className="font-semibold underline">
            Cadastrar serviços
          </Link>
        </Aviso>
      )}

      <FormAgendamentoOnline
        site={urlDoSite()}
        empresa={empresa.nome}
        inicial={{
          slug: e?.slug ?? "",
          ligado: e?.agendamento_online ?? false,
          diasAdiante: e?.agendamento_dias_adiante ?? 30,
          antecedencia: e?.agendamento_antecedencia_horas ?? 1,
          mostrarPrecos: e?.agendamento_mostrar_precos ?? true,
          mensagem: e?.agendamento_mensagem ?? "",
          datasFechadas: ((e?.datas_fechadas as string[] | null) ?? []).slice().sort(),
        }}
        atendimento={{
          abertura: (e?.horario_abertura ?? "08:00").slice(0, 5),
          fechamento: (e?.horario_fechamento ?? "18:00").slice(0, 5),
          dias: (e?.dias_funcionamento as number[] | null) ?? [1, 2, 3, 4, 5, 6],
        }}
      />
    </div>
  );
}
