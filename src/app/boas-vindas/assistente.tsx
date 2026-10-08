"use client";

import { useActionState, useState } from "react";
import { Car, Check, Scissors, ShoppingBag, Sparkles, Stethoscope, type LucideIcon } from "lucide-react";
import { Aviso, Botao, Campo, Cartao } from "@/components/ui";
import { LISTA_NICHOS, type NichoId } from "@/config/nichos";
import { PERGUNTAS, TELA_DA_PERGUNTA } from "@/config/perfil-negocio";
import { concluirOnboarding } from "./acoes";
import { ETAPA_DO_CAMPO, TOTAL_ETAPAS } from "./validacao";
import { Formulario } from "@/components/formulario";

const ICONES: Record<NichoId, LucideIcon> = {
  mecanica: Car,
  odontologia: Stethoscope,
  salao: Scissors,
  varejo: ShoppingBag,
  outro: Sparkles,
};

const TITULOS = [
  "Como se chama seu negócio?",
  "Qual é o tipo do negócio?",
  "Conte um pouco sobre o negócio",
  "Para terminar",
];
const ULTIMA = TOTAL_ETAPAS - 1;
const ETAPAS = Array.from({ length: TOTAL_ETAPAS }, (_, i) => i);

/**
 * Onboarding em 4 telas dentro de um único formulário: nome, tipo e duas
 * telas de perguntas rápidas (opcionais) sobre o negócio. O caixa começa
 * zerado, então o saldo inicial não é perguntado. As telas que não estão
 * visíveis continuam no formulário (só ficam escondidas), então tudo é
 * enviado junto no final e validado no servidor.
 */
export function Assistente({ nomeInicial }: { nomeInicial: string }) {
  const [etapa, setEtapa] = useState(0);
  const [estado, acao, enviando] = useActionState(
    async (anterior: Awaited<ReturnType<typeof concluirOnboarding>>, form: FormData) => {
      const r = await concluirOnboarding(anterior, form);
      // Se o servidor recusar algum campo, volta para a tela dele.
      const campos = Object.keys(r.erros ?? {});
      if (campos.length) setEtapa(Math.min(...campos.map((c) => ETAPA_DO_CAMPO[c] ?? 0)));
      return r;
    },
    {},
  );
  const [nome, setNome] = useState(nomeInicial);
  const [nicho, setNicho] = useState<NichoId | "">("");
  const [erroLocal, setErroLocal] = useState<string>();
  const [marketing, setMarketing] = useState<"sim" | "nao" | "">("");

  function avancar() {
    if (etapa === 0 && nome.trim().length < 2) return setErroLocal("Digite o nome do seu negócio.");
    if (etapa === 1 && !nicho) return setErroLocal("Escolha uma opção.");
    setErroLocal(undefined);
    setEtapa(etapa + 1);
  }

  return (
    <Cartao>
      <div className="mb-6 flex gap-2" aria-label={`Passo ${etapa + 1} de ${TOTAL_ETAPAS}`}>
        {ETAPAS.map((i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= etapa ? "bg-royal-vivo" : "bg-borda"}`} />
        ))}
      </div>
      <p className="text-sm font-medium text-suave">
        Passo {etapa + 1} de {TOTAL_ETAPAS}
      </p>
      <h1 className="mt-1 text-2xl">{TITULOS[etapa]}</h1>

      <Formulario
        acao={acao}
        className="mt-6 space-y-5"
        onSubmit={(e) => {
          // Segurança extra: o envio só acontece na última tela.
          if (etapa < ULTIMA) {
            e.preventDefault();
            avancar();
          }
        }}
      >
        {estado.erro && <Aviso>{estado.erro}</Aviso>}

        <div hidden={etapa !== 0}>
          <Campo
            rotulo="Nome do negócio"
            nome="nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                avancar();
              }
            }}
            placeholder="Ex.: Oficina do Zé"
            autoComplete="organization"
            maxLength={120}
            erro={(etapa === 0 && erroLocal) || estado.erros?.nome}
          />
        </div>

        <fieldset hidden={etapa !== 1}>
          <legend className="sr-only">Tipo do negócio</legend>
          <p className="mb-3 text-sm text-suave">Já deixamos as categorias de entradas e saídas prontas para você.</p>
          <div className="grid gap-2">
            {LISTA_NICHOS.map((n) => {
              const Icone = ICONES[n.id];
              const marcado = nicho === n.id;
              return (
                <label
                  key={n.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${
                    marcado ? "border-royal-vivo bg-royal-claro" : "border-borda hover:bg-cartao"
                  }`}
                >
                  <input
                    type="radio"
                    name="nicho"
                    value={n.id}
                    checked={marcado}
                    onChange={() => setNicho(n.id)}
                    className="sr-only"
                  />
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white text-royal">
                    <Icone className="size-5" strokeWidth={1.75} />
                  </span>
                  <span className="flex-1">
                    <span className="block font-semibold text-tinta">{n.nome}</span>
                    <span className="block text-sm text-suave">{n.descricao}</span>
                  </span>
                  {marcado && <Check className="size-5 text-royal-vivo" strokeWidth={2} />}
                </label>
              );
            })}
          </div>
          {((etapa === 1 && erroLocal) || estado.erros?.nicho) && (
            <p className="mt-2 text-sm text-saida">{(etapa === 1 && erroLocal) || estado.erros?.nicho}</p>
          )}
        </fieldset>

        {[2, 3].map((tela) => (
          <div key={tela} hidden={etapa !== tela} className="space-y-4">
            {tela === 2 && (
              <p className="text-sm text-suave">São perguntas rápidas e opcionais. Ajudam a deixar o Agilizou do jeito do seu negócio.</p>
            )}
            {PERGUNTAS.filter((p) => TELA_DA_PERGUNTA[p.campo] === tela).map((p) => (
              <label key={p.campo} className="block">
                <span className="mb-1.5 block text-sm font-medium text-tinta">{p.pergunta}</span>
                <select
                  name={p.campo}
                  defaultValue=""
                  aria-invalid={estado.erros?.[p.campo] ? true : undefined}
                  className="h-12 w-full rounded-xl border border-borda bg-white px-3 text-base text-texto outline-none focus:border-royal-vivo focus:ring-2 focus:ring-royal-vivo/20"
                >
                  <option value="">Escolha uma opção</option>
                  {p.opcoes.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.rotulo}
                    </option>
                  ))}
                </select>
                {estado.erros?.[p.campo] && <span className="mt-1 block text-sm text-saida">{estado.erros[p.campo]}</span>}
              </label>
            ))}
            {tela === 3 && (
              <fieldset className="rounded-xl border border-borda p-4">
                <legend className="px-1 text-sm font-medium text-tinta">Quer ajuda para atrair mais clientes?</legend>
                <p className="text-sm text-suave">
                  Temos um time de marketing que pode ajudar o seu negócio a crescer. Se quiser, a gente entra em contato para conversar, sem compromisso.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(
                    [
                      ["sim", "Sim, quero conversar"],
                      ["nao", "Agora não"],
                    ] as const
                  ).map(([valor, rotulo]) => (
                    <label
                      key={valor}
                      className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-3 text-center text-sm font-semibold transition-colors ${
                        marketing === valor ? "border-royal-vivo bg-royal-claro text-royal" : "border-borda text-texto hover:bg-cartao"
                      }`}
                    >
                      <input type="radio" name="quer_marketing" value={valor} checked={marketing === valor} onChange={() => setMarketing(valor)} className="sr-only" />
                      {rotulo}
                    </label>
                  ))}
                </div>
                {marketing === "sim" && (
                  <div className="mt-3">
                    <Campo
                      rotulo="Seu WhatsApp"
                      nome="whatsapp_contato"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="(11) 99999-8888"
                      ajuda="Com DDD. É por ele que o nosso time fala com você."
                      erro={estado.erros?.whatsapp_contato}
                    />
                  </div>
                )}
              </fieldset>
            )}
          </div>
        ))}

        <div className="flex gap-3 pt-2">
          {etapa > 0 && (
            <Botao type="button" variante="secundario" className="w-1/3" onClick={() => setEtapa(etapa - 1)}>
              Voltar
            </Botao>
          )}
          {etapa < ULTIMA ? (
            // key diferente: sem isso o React reaproveita o mesmo <button> e,
            // ao virar type="submit" no meio do clique, o formulário é enviado.
            <Botao key="continuar" type="button" onClick={avancar}>
              Continuar
            </Botao>
          ) : (
            <Botao key="enviar" type="submit" disabled={enviando}>
              {enviando ? "Preparando..." : "Começar"}
            </Botao>
          )}
        </div>
      </Formulario>
    </Cartao>
  );
}
