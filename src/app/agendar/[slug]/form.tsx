"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { CalendarCheck, Check } from "lucide-react";
import { Formulario } from "@/components/formulario";
import { Aviso, Botao, Campo, Cartao } from "@/components/ui";
import { partesSp } from "@/lib/agenda";
import { DURACAO_PADRAO, diasAbertos, horariosDoDia, rotuloDoDia, type AgendaPublica } from "@/lib/agendamento-online";
import { formatarData } from "@/lib/datas";
import { formatarReais } from "@/lib/dinheiro";
import { agendarOnline, type EstadoAgendar } from "./acoes";

type Termos = { cliente: string; clientes: string; profissional: string; profissionais: string };

/** Formulário do link público: serviço → profissional → dia → horário → dados. */
export function FormAgendar({
  slug,
  agenda,
  termos,
  hoje,
  agoraIso,
}: {
  slug: string;
  agenda: AgendaPublica;
  termos: Termos;
  hoje: string;
  agoraIso: string;
}) {
  const router = useRouter();
  const [estado, acao, enviando] = useActionState<EstadoAgendar, FormData>(agendarOnline, {});
  const [servico, setServico] = useState(agenda.servicos.length === 1 ? agenda.servicos[0].id : "");
  const [profissional, setProfissional] = useState(agenda.profissionais.length === 1 ? agenda.profissionais[0].id : "");
  const [dia, setDia] = useState("");
  const [hora, setHora] = useState("");
  const [fechado, setFechado] = useState(false);

  const temServicos = agenda.servicos.length > 0;
  const escolhido = agenda.servicos.find((s) => s.id === servico);
  const duracao = escolhido?.duracao_minutos ?? DURACAO_PADRAO;
  const prontoParaDia = !temServicos || Boolean(escolhido);

  // Dias abertos e os horários livres de cada um, para o serviço e o profissional escolhidos.
  const dias = useMemo(() => diasAbertos(agenda.horario, hoje), [agenda.horario, hoje]);
  const horariosPorDia = useMemo(() => {
    const mapa = new Map<string, string[]>();
    for (const d of dias) mapa.set(d, horariosDoDia({ agenda, dia: d, duracao, profissional: profissional || null, agoraIso }));
    return mapa;
  }, [agenda, dias, duracao, profissional, agoraIso]);
  const primeiroLivre = dias.find((d) => (horariosPorDia.get(d)?.length ?? 0) > 0) ?? "";
  const diaAtual = dia && (horariosPorDia.get(dia)?.length ?? 0) > 0 ? dia : primeiroLivre;
  const horarios = horariosPorDia.get(diaAtual) ?? [];
  const horaAtual = horarios.includes(hora) ? hora : "";

  // Outra pessoa pegou o horário: busca a agenda de novo para mostrar o que sobrou.
  useEffect(() => {
    if (estado.conflito) router.refresh();
  }, [estado, router]);

  const erros = estado.erros ?? {};
  // Enquanto um novo pedido está indo, a confirmação anterior não aparece.
  const marcado = estado.marcado && !fechado && !enviando ? estado.marcado : null;

  if (marcado) {
    const { data, hora: h } = partesSp(marcado.inicio);
    const r = rotuloDoDia(data);
    return (
      <Cartao className="text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-entrada/10 text-entrada">
          <CalendarCheck className="size-7" strokeWidth={1.75} />
        </span>
        <h2 className="mt-3 text-xl">Horário marcado!</h2>
        <p className="mt-2 text-texto">
          <span className="capitalize">{r.semana}</span>, {formatarData(data)} às <strong className="numero">{h}</strong>
        </p>
        <p className="mt-1 text-sm text-suave">{[marcado.servico, marcado.profissional].filter(Boolean).join(" · ")}</p>
        <p className="mt-4 text-sm text-suave">
          {agenda.empresa.nome} já recebeu o seu agendamento. Se precisar mudar ou cancelar, fale direto com a empresa.
        </p>
        <Botao
          type="button"
          variante="secundario"
          className="mt-5"
          onClick={() => {
            setFechado(true);
            setHora("");
            router.refresh();
          }}
        >
          Marcar outro horário
        </Botao>
      </Cartao>
    );
  }

  if (agenda.profissionais.length === 0) {
    return (
      <Cartao className="text-center text-sm text-suave">
        Esta agenda ainda não tem horários abertos. Fale direto com a empresa para marcar.
      </Cartao>
    );
  }

  return (
    <Formulario
      acao={(dados) => {
        setFechado(false);
        return acao(dados);
      }}
      className="space-y-4"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="servico_id" value={servico} />
      <input type="hidden" name="profissional_id" value={profissional} />
      <input type="hidden" name="data" value={diaAtual} />
      <input type="hidden" name="hora" value={horaAtual} />
      {/* Campo-isca contra robôs: fica fora da tela e ninguém deve preencher. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Não preencha este campo
          <input type="text" name="site" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {temServicos && (
        <Cartao className="p-4">
          <h2 className="text-base">1. Escolha o serviço</h2>
          <div className="mt-3 grid gap-2">
            {agenda.servicos.map((s) => {
              const ativo = servico === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => {
                    setServico(s.id);
                    setHora("");
                  }}
                  className={`flex min-h-14 items-center gap-3 rounded-xl border px-4 py-2 text-left transition-colors ${
                    ativo ? "border-royal-vivo bg-royal-claro" : "border-borda hover:bg-cartao"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-tinta">{s.nome}</span>
                    <span className="block text-sm text-suave">
                      {s.duracao_minutos} min{s.preco_centavos !== null ? ` · ${formatarReais(s.preco_centavos)}` : ""}
                    </span>
                  </span>
                  {ativo && <Check className="size-5 shrink-0 text-royal-vivo" strokeWidth={2} />}
                </button>
              );
            })}
          </div>
          {erros.servico_id && <p className="mt-2 text-sm text-saida">{erros.servico_id}</p>}
        </Cartao>
      )}

      {agenda.profissionais.length > 1 && (
        <Cartao className="p-4">
          <h2 className="text-base">
            {temServicos ? "2. " : "1. "}Com quem?
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {[{ id: "", nome: "Tanto faz" }, ...agenda.profissionais].map((p) => {
              const ativo = profissional === p.id;
              return (
                <button
                  key={p.id || "qualquer"}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => {
                    setProfissional(p.id);
                    setHora("");
                  }}
                  className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors ${
                    ativo ? "border-royal-vivo bg-royal-claro text-royal" : "border-borda text-texto hover:bg-cartao"
                  }`}
                >
                  {p.nome}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-suave">
            &ldquo;Tanto faz&rdquo; mostra mais horários: marcamos com o {termos.profissional} que estiver livre.
          </p>
        </Cartao>
      )}

      <Cartao className="p-4">
        <h2 className="text-base">Dia e horário</h2>
        {!prontoParaDia ? (
          <p className="mt-2 text-sm text-suave">Escolha o serviço para ver os horários livres.</p>
        ) : !primeiroLivre ? (
          <p className="mt-2 text-sm text-suave">
            Não há horários livres nos próximos dias. Fale direto com a empresa para marcar.
          </p>
        ) : (
          <>
            <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-2" role="group" aria-label="Dia">
              {dias.map((d) => {
                const r = rotuloDoDia(d);
                const livres = horariosPorDia.get(d)?.length ?? 0;
                const ativo = d === diaAtual;
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={livres === 0}
                    aria-pressed={ativo}
                    aria-label={`${r.semana}, ${formatarData(d)}${livres === 0 ? ", sem horário" : ""}`}
                    onClick={() => {
                      setDia(d);
                      setHora("");
                    }}
                    className={`flex w-16 shrink-0 flex-col items-center rounded-xl border py-2 transition-colors ${
                      ativo
                        ? "border-royal-vivo bg-royal-vivo text-white"
                        : livres === 0
                          ? "border-borda text-suave/50 line-through"
                          : "border-borda text-texto hover:bg-cartao"
                    }`}
                  >
                    <span className="text-xs">{d === hoje ? "hoje" : r.semana.slice(0, 3)}</span>
                    <span className="numero text-lg font-semibold leading-tight">{r.dia}</span>
                    <span className="text-xs">{r.mes}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-sm font-medium capitalize text-tinta">
              {rotuloDoDia(diaAtual).semana}, {formatarData(diaAtual)}
            </p>
            <div className="mt-2 grid grid-cols-4 gap-2" role="group" aria-label="Horário">
              {horarios.map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-pressed={horaAtual === h}
                  onClick={() => setHora(h)}
                  className={`numero h-11 rounded-lg border text-sm font-medium transition-colors ${
                    horaAtual === h ? "border-royal-vivo bg-royal-vivo text-white" : "border-borda text-texto hover:bg-cartao"
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
          </>
        )}
        {(erros.data || erros.hora) && <p className="mt-2 text-sm text-saida">{erros.data ?? erros.hora}</p>}
      </Cartao>

      <Cartao className="space-y-3 p-4">
        <h2 className="text-base">Seus dados</h2>
        <Campo rotulo="Seu nome" nome="nome" autoComplete="name" maxLength={120} erro={erros.nome} required />
        <Campo
          rotulo="Seu WhatsApp"
          nome="whatsapp"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 99999-8888"
          ajuda="Com DDD. É por ele que a empresa confirma o seu horário."
          erro={erros.whatsapp}
          required
        />
        <Campo rotulo="Observação (opcional)" nome="observacao" maxLength={300} erro={erros.observacao} />
      </Cartao>

      {estado.erro && <Aviso>{estado.erro}</Aviso>}

      <Botao type="submit" disabled={enviando || !horaAtual}>
        {enviando ? "Marcando..." : horaAtual ? `Confirmar para ${formatarData(diaAtual).slice(0, 5)} às ${horaAtual}` : "Escolha o horário"}
      </Botao>
      <p className="text-center text-xs text-suave">
        Ao confirmar, seu nome e WhatsApp são enviados para {agenda.empresa.nome} entrar em contato sobre este horário.
      </p>
    </Formulario>
  );
}
