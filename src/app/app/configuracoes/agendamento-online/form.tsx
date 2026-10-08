"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Check, Copy, ExternalLink, MessageCircle, X } from "lucide-react";
import { Formulario } from "@/components/formulario";
import { Aviso, Botao, Cartao } from "@/components/ui";
import { gerarSlug } from "@/lib/agendamento-online";
import { formatarData } from "@/lib/datas";
import { salvarAgendamentoOnline } from "./acoes";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

type Inicial = {
  slug: string;
  ligado: boolean;
  diasAdiante: number;
  antecedencia: number;
  mostrarPrecos: boolean;
  mensagem: string;
  datasFechadas: string[];
};

export function FormAgendamentoOnline({
  site,
  empresa,
  inicial,
  atendimento,
}: {
  site: string;
  empresa: string;
  inicial: Inicial;
  atendimento: { abertura: string; fechamento: string; dias: number[] };
}) {
  const [estado, acao, salvando] = useActionState(salvarAgendamentoOnline, {});
  const [ligado, setLigado] = useState(inicial.ligado);
  const [slug, setSlug] = useState(inicial.slug || gerarSlug(empresa));
  const [datas, setDatas] = useState(inicial.datasFechadas);
  const [novaData, setNovaData] = useState("");
  const [copiado, setCopiado] = useState(false);

  // O link "valendo" é o que está salvo; o campo pode estar no meio de uma edição.
  const linkSalvo = inicial.slug ? `${site}/agendar/${inicial.slug}` : "";
  const semProtocolo = site.replace(/^https?:\/\//, "");
  const mensagemWhats = `Olá! Para marcar seu horário em ${empresa}, é só escolher o dia e a hora aqui: ${linkSalvo}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(linkSalvo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Navegador sem permissão para copiar: o link fica visível para copiar à mão.
    }
  }

  function adicionarData() {
    if (!novaData || datas.includes(novaData)) return;
    setDatas([...datas, novaData].sort());
    setNovaData("");
  }

  return (
    <div className="space-y-4">
      {inicial.ligado && linkSalvo && (
        <Cartao className="space-y-3 p-4">
          <h2 className="text-base">Seu link</h2>
          <p className="break-all rounded-xl bg-royal-claro px-4 py-3 text-sm font-semibold text-royal">{linkSalvo}</p>
          <div className="grid grid-cols-3 gap-2 text-sm font-semibold">
            <button type="button" onClick={copiar} className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-borda text-royal hover:bg-cartao">
              {copiado ? <Check className="size-4" /> : <Copy className="size-4" />} {copiado ? "Copiado" : "Copiar"}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(mensagemWhats)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-borda text-royal hover:bg-cartao"
            >
              <MessageCircle className="size-4" /> WhatsApp
            </a>
            <Link href={`/agendar/${inicial.slug}`} target="_blank" className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-borda text-royal hover:bg-cartao">
              <ExternalLink className="size-4" /> Abrir
            </Link>
          </div>
        </Cartao>
      )}

      <Cartao>
        <Formulario acao={acao} className="space-y-5">
          {estado.sucesso && <Aviso tipo="sucesso">{estado.sucesso}</Aviso>}
          {estado.erro && <Aviso>{estado.erro}</Aviso>}

          <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-medium text-tinta">
            Receber agendamentos pelo link
            <input type="checkbox" name="agendamento_online" checked={ligado} onChange={(e) => setLigado(e.target.checked)} className="size-6 accent-royal-vivo" />
          </label>

          <div>
            <label htmlFor="slug" className="mb-1.5 block text-sm font-medium text-tinta">
              Endereço do link
            </label>
            <div className="flex items-center overflow-hidden rounded-xl border border-borda bg-white focus-within:border-royal-vivo focus-within:ring-2 focus-within:ring-royal-vivo/20">
              <span className="shrink-0 bg-cartao px-3 py-3 text-sm text-suave">{semProtocolo}/agendar/</span>
              <input
                id="slug"
                name="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                onBlur={() => setSlug(gerarSlug(slug))}
                maxLength={60}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={estado.erros?.slug ? true : undefined}
                className="h-12 min-w-0 flex-1 px-2 text-base text-texto outline-none"
              />
            </div>
            {estado.erros?.slug ? (
              <p className="mt-1 text-sm text-saida">{estado.erros.slug}</p>
            ) : (
              <p className="mt-1 text-sm text-suave">Use o nome do seu negócio. Se trocar depois, os links já enviados param de funcionar.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-tinta">Marcar com até</span>
              <select name="agendamento_dias_adiante" defaultValue={inicial.diasAdiante} className="h-12 w-full rounded-xl border border-borda bg-white px-3">
                {[7, 15, 30, 60, 90].map((n) => (
                  <option key={n} value={n}>
                    {n} dias de antecedência
                  </option>
                ))}
                {![7, 15, 30, 60, 90].includes(inicial.diasAdiante) && <option value={inicial.diasAdiante}>{inicial.diasAdiante} dias de antecedência</option>}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-tinta">Aviso mínimo</span>
              <select name="agendamento_antecedencia_horas" defaultValue={inicial.antecedencia} className="h-12 w-full rounded-xl border border-borda bg-white px-3">
                <option value={0}>Pode marcar em cima da hora</option>
                {[1, 2, 4, 12, 24, 48].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "hora" : "horas"} antes
                  </option>
                ))}
                {![0, 1, 2, 4, 12, 24, 48].includes(inicial.antecedencia) && <option value={inicial.antecedencia}>{inicial.antecedencia} horas antes</option>}
              </select>
            </label>
          </div>

          <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-medium text-tinta">
            Mostrar o preço dos serviços
            <input type="checkbox" name="agendamento_mostrar_precos" defaultChecked={inicial.mostrarPrecos} className="size-6 accent-royal-vivo" />
          </label>

          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-tinta">Recado no topo da página (opcional)</span>
            <textarea
              name="agendamento_mensagem"
              defaultValue={inicial.mensagem}
              maxLength={300}
              rows={3}
              placeholder="Ex.: Rua das Flores, 120. Chegue 5 minutos antes."
              className="w-full rounded-xl border border-borda bg-white px-4 py-3 text-base text-texto outline-none focus:border-royal-vivo focus:ring-2 focus:ring-royal-vivo/20"
            />
            {estado.erros?.agendamento_mensagem && <span className="mt-1 block text-sm text-saida">{estado.erros.agendamento_mensagem}</span>}
          </label>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-tinta">Datas sem atendimento</legend>
            <p className="mb-2 text-sm text-suave">Feriado, folga ou férias. Nessas datas o link não mostra horários.</p>
            <div className="flex gap-2">
              <input
                type="date"
                value={novaData}
                onChange={(e) => setNovaData(e.target.value)}
                aria-label="Data sem atendimento"
                className="h-12 min-w-0 flex-1 rounded-xl border border-borda bg-white px-3"
              />
              <Botao type="button" variante="secundario" className="w-auto px-4" onClick={adicionarData} disabled={!novaData}>
                Adicionar
              </Botao>
            </div>
            {datas.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {datas.map((d) => (
                  <li key={d} className="numero inline-flex items-center gap-1 rounded-full bg-cartao py-1 pl-3 pr-1 text-sm text-texto">
                    <input type="hidden" name="datas_fechadas" value={d} />
                    {formatarData(d)}
                    <button type="button" onClick={() => setDatas(datas.filter((x) => x !== d))} aria-label={`Remover ${formatarData(d)}`} className="grid size-7 place-items-center rounded-full text-suave hover:bg-borda">
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {estado.erros?.datas_fechadas && <p className="mt-1 text-sm text-saida">{estado.erros.datas_fechadas}</p>}
          </fieldset>

          <p className="rounded-xl bg-cartao px-4 py-3 text-sm text-suave">
            Dias e horário de atendimento: {atendimento.dias.length ? atendimento.dias.map((d) => DIAS[d]).join(", ") : "nenhum dia marcado"}, das {atendimento.abertura} às{" "}
            {atendimento.fechamento}.{" "}
            <Link href="/app/configuracoes/agenda" className="font-semibold text-royal-vivo underline">
              Alterar
            </Link>
          </p>

          <Botao type="submit" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </Botao>
        </Formulario>
      </Cartao>
    </div>
  );
}
