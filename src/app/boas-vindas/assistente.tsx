"use client";

import { useActionState, useState } from "react";
import { Car, Check, Scissors, ShoppingBag, Sparkles, Stethoscope, type LucideIcon } from "lucide-react";
import { CampoDinheiro } from "@/components/campo-dinheiro";
import { Aviso, Botao, Campo, Cartao } from "@/components/ui";
import { LISTA_NICHOS, type NichoId } from "@/config/nichos";
import { concluirOnboarding } from "./acoes";
import { ETAPA_DO_CAMPO } from "./validacao";
import { Formulario } from "@/components/formulario";

const ICONES: Record<NichoId, LucideIcon> = {
  mecanica: Car,
  odontologia: Stethoscope,
  salao: Scissors,
  varejo: ShoppingBag,
  outro: Sparkles,
};

const TITULOS = ["Como se chama seu negócio?", "Qual é o tipo do negócio?", "Quanto tem no caixa hoje?"];

/**
 * Onboarding em 3 telas dentro de um único formulário. As telas que não
 * estão visíveis continuam no formulário (só ficam escondidas), então tudo é
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

  function avancar() {
    if (etapa === 0 && nome.trim().length < 2) return setErroLocal("Digite o nome do seu negócio.");
    if (etapa === 1 && !nicho) return setErroLocal("Escolha uma opção.");
    setErroLocal(undefined);
    setEtapa(etapa + 1);
  }

  return (
    <Cartao>
      <div className="mb-6 flex gap-2" aria-label={`Passo ${etapa + 1} de 3`}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= etapa ? "bg-royal-vivo" : "bg-borda"}`} />
        ))}
      </div>
      <p className="text-sm font-medium text-suave">Passo {etapa + 1} de 3</p>
      <h1 className="mt-1 text-2xl">{TITULOS[etapa]}</h1>

      <Formulario
        acao={acao}
        className="mt-6 space-y-5"
        onSubmit={(e) => {
          // Segurança extra: o envio só acontece na última tela.
          if (etapa < 2) {
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

        <div hidden={etapa !== 2}>
          <CampoDinheiro
            nome="saldo"
            rotulo="Saldo do caixa hoje"
            ajuda="Some o dinheiro na gaveta e na conta do negócio. Se não souber, deixe zero e ajuste depois."
            permitirNegativo
            erro={estado.erros?.saldo}
          />
        </div>

        <div className="flex gap-3 pt-2">
          {etapa > 0 && (
            <Botao type="button" variante="secundario" className="w-1/3" onClick={() => setEtapa(etapa - 1)}>
              Voltar
            </Botao>
          )}
          {etapa < 2 ? (
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
