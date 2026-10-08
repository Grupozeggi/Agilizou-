import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, CalendarOff, ChevronLeft, ChevronRight, Plus, Users } from "lucide-react";
import { Aviso, Cartao } from "@/components/ui";
import { termosDoNicho } from "@/config/nichos";
import { horariosLivres, paraMinutos, partesSp } from "@/lib/agenda";
import { formatarData, hojeIso, somarDias } from "@/lib/datas";
import { inicioDaSemana } from "@/lib/periodo";
import { exigirCliente } from "@/lib/sessao";
import { atendimentosEntre, cadastrosAgenda } from "./dados";
import { CartaoAtendimento } from "./cartao";

export const metadata: Metadata = { title: "Agenda" };

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export default async function Agenda({ searchParams }: PageProps<"/app/agenda">) {
  const p = await searchParams;
  const { supabase, empresa } = await exigirCliente();
  const t = termosDoNicho(empresa.nicho);

  if (!empresa.agenda_ativa) {
    return (
      <Cartao className="text-center">
        <CalendarOff className="mx-auto size-8 text-suave" />
        <h1 className="mt-2 text-xl">Agenda desligada</h1>
        <p className="mt-1 text-sm text-suave">Ligue a agenda para marcar atendimentos, controlar presença e mandar lembretes.</p>
        <Link href="/app/configuracoes/agenda" className="mt-4 inline-block font-semibold text-royal-vivo underline">
          Ligar a agenda
        </Link>
      </Cartao>
    );
  }

  const hoje = hojeIso();
  const dia = typeof p.dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.dia) ? p.dia : hoje;
  const semana = p.visao === "semana";
  const inicio = semana ? inicioDaSemana(dia) : dia;
  const fim = semana ? somarDias(inicio, 6) : dia;
  const filtroProf = typeof p.profissional === "string" ? p.profissional : null;

  const [atendimentos, cad] = await Promise.all([atendimentosEntre(supabase, inicio, fim), cadastrosAgenda(supabase)]);
  const profs = cad.profissionais.filter((x) => !filtroProf || x.id === filtroProf);
  const visiveis = atendimentos.filter((a) => !filtroProf || a.profissional?.id === filtroProf);
  const link = (extra: Record<string, string | null>) => {
    const q = new URLSearchParams({ dia, ...(semana ? { visao: "semana" } : {}), ...(filtroProf ? { profissional: filtroProf } : {}) });
    for (const [k, v] of Object.entries(extra)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    return `/app/agenda?${q}`;
  };
  const passo = semana ? 7 : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl">Agenda</h1>
        <div className="flex gap-2">
          <Link href="/app/agenda/indicadores" className="grid size-10 place-items-center rounded-xl border border-borda bg-white text-royal" aria-label="Indicadores">
            <BarChart3 className="size-4" />
          </Link>
          <Link href="/app/profissionais" className="grid size-10 place-items-center rounded-xl border border-borda bg-white text-royal" aria-label={t.profissionais}>
            <Users className="size-4" />
          </Link>
          <Link href={`/app/agenda/novo?dia=${dia}`} className="inline-flex h-10 items-center gap-1 rounded-xl bg-royal-vivo px-4 text-sm font-semibold text-white">
            <Plus className="size-4" /> Agendar
          </Link>
        </div>
      </div>
      {p.novo && <Aviso tipo="sucesso">Agendado!</Aviso>}

      <div className="flex items-center justify-between rounded-xl bg-white px-2 py-1 shadow-suave">
        <Link href={link({ dia: somarDias(dia, -passo) })} className="grid size-11 place-items-center text-royal" aria-label="Anterior">
          <ChevronLeft className="size-5" />
        </Link>
        <Link href={link({ dia: hoje })} className="text-center font-semibold text-tinta">
          {semana ? `${formatarData(inicio).slice(0, 5)} a ${formatarData(fim).slice(0, 5)}` : dia === hoje ? "Hoje" : `${DIAS[new Date(`${dia}T12:00:00Z`).getUTCDay()]}, ${formatarData(dia)}`}
        </Link>
        <Link href={link({ dia: somarDias(dia, passo) })} className="grid size-11 place-items-center text-royal" aria-label="Próximo">
          <ChevronRight className="size-5" />
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 text-sm">
        <Link href={link({ visao: semana ? null : "semana" })} className="shrink-0 rounded-full border border-borda bg-white px-4 py-2 font-medium text-royal">
          {semana ? "Ver dia" : "Ver semana"}
        </Link>
        {cad.profissionais.length > 1 &&
          [{ id: null as string | null, nome: "Todos" }, ...cad.profissionais].map((x) => (
            <Link
              key={x.id ?? "todos"}
              href={link({ profissional: x.id })}
              className={`shrink-0 rounded-full border px-4 py-2 font-medium ${filtroProf === x.id ? "border-royal-vivo bg-royal-claro text-royal" : "border-borda text-suave"}`}
            >
              {x.nome}
            </Link>
          ))}
      </div>

      {cad.profissionais.length === 0 ? (
        <Cartao className="text-center text-sm text-suave">
          Cadastre pelo menos um {t.profissional} para usar a agenda.{" "}
          <Link href="/app/profissionais" className="font-semibold text-royal-vivo underline">
            Cadastrar
          </Link>
        </Cartao>
      ) : semana ? (
        Array.from({ length: 7 }, (_, i) => somarDias(inicio, i)).map((d) => {
          const doDia = visiveis.filter((a) => partesSp(a.inicio).data === d);
          return (
            <section key={d}>
              <Link href={link({ dia: d, visao: null })} className={`mb-2 block px-1 text-sm font-semibold ${d === hoje ? "text-royal" : "text-suave"}`}>
                {DIAS[new Date(`${d}T12:00:00Z`).getUTCDay()]}, {formatarData(d).slice(0, 5)} · {doDia.filter((a) => a.status !== "cancelado" && a.status !== "remarcado").length}
              </Link>
              {doDia.length > 0 && (
                <ul className="space-y-2">
                  {doDia.map((a) => (
                    <CartaoAtendimento key={a.id} a={a} agoraIso={new Date().toISOString()} compacto />
                  ))}
                </ul>
              )}
            </section>
          );
        })
      ) : (
        profs.map((prof) => {
          const doProf = visiveis.filter((a) => a.profissional?.id === prof.id);
          const ocupados = doProf
            .filter((a) => a.status !== "cancelado" && a.status !== "remarcado")
            .map((a) => ({ inicio: paraMinutos(partesSp(a.inicio).hora), fim: paraMinutos(partesSp(a.fim).hora) }));
          const abre = cad.horario.dias.includes(new Date(`${dia}T12:00:00Z`).getUTCDay());
          const agora = partesSp(new Date().toISOString());
          const livres = abre
            ? horariosLivres({
                abertura: cad.horario.abertura,
                fechamento: cad.horario.fechamento,
                duracao: 30,
                passo: 30,
                ocupados,
                aPartirDe: dia === hoje ? paraMinutos(agora.hora) : dia < hoje ? 24 * 60 : undefined,
              })
            : [];
          return (
            <section key={prof.id} className="space-y-2">
              {profs.length > 1 && <h2 className="px-1 text-sm font-semibold text-suave">{prof.nome}</h2>}
              {doProf.length === 0 && <p className="px-1 text-sm text-suave">Nenhum atendimento.</p>}
              <ul className="space-y-2">
                {doProf.map((a) => (
                  <CartaoAtendimento key={a.id} a={a} agoraIso={new Date().toISOString()} />
                ))}
              </ul>
              {livres.length > 0 && (
                <div>
                  <p className="mb-1.5 px-1 text-xs text-suave">Horários vagos</p>
                  <div className="flex flex-wrap gap-1.5">
                    {livres.map((h) => (
                      <Link
                        key={h}
                        href={`/app/agenda/novo?dia=${dia}&hora=${h}&profissional=${prof.id}`}
                        className="numero rounded-lg border border-dashed border-royal-vivo/40 px-2.5 py-1.5 text-sm text-royal hover:bg-royal-claro"
                      >
                        {h}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {!abre && <p className="px-1 text-xs text-suave">Fechado neste dia.</p>}
            </section>
          );
        })
      )}
    </div>
  );
}
