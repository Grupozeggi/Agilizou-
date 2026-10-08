"use client";

import { useActionState, useState, useTransition } from "react";
import { Aviso, Botao, Campo, Cartao } from "@/components/ui";
import { PLANOS, type PlanoId } from "@/config/planos";
import { formatarReais } from "@/lib/dinheiro";
import type { EstadoForm } from "@/lib/formulario";
import { assinar, cancelarAssinatura, pagar, trocarPlano } from "./acoes";
import { Formulario } from "@/components/formulario";

export function AcoesAssinatura({
  assinante,
  planoAtual,
  planoProximo,
  statusAtivo,
}: {
  assinante: boolean;
  planoAtual: PlanoId;
  planoProximo: PlanoId | null;
  statusAtivo: boolean;
}) {
  const [escolhido, setEscolhido] = useState<PlanoId>(planoAtual === "essencial" ? "profissional" : planoAtual);
  const [estadoAssinar, acaoAssinar, assinando] = useActionState(assinar, {});
  const [estadoTroca, acaoTroca, trocando] = useActionState(trocarPlano, {});
  const [msg, setMsg] = useState<EstadoForm>({});
  const [ocupado, iniciar] = useTransition();

  if (!assinante) {
    return (
      <Cartao>
        <h2 className="text-lg">Assinar o Agilizou</h2>
        <Formulario acao={acaoAssinar} className="mt-4 space-y-4">
          {estadoAssinar.erro && <Aviso>{estadoAssinar.erro}</Aviso>}
          {estadoAssinar.sucesso && <Aviso tipo="sucesso">{estadoAssinar.sucesso}</Aviso>}
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(PLANOS) as PlanoId[]).map((id) => (
              <label
                key={id}
                className={`cursor-pointer rounded-xl border p-3 text-center ${escolhido === id ? "border-royal-vivo bg-royal-claro" : "border-borda"}`}
              >
                <input type="radio" name="plano" value={id} checked={escolhido === id} onChange={() => setEscolhido(id)} className="sr-only" />
                <span className="block font-semibold text-tinta">{PLANOS[id].nome}</span>
                <span className="numero text-sm text-suave">{formatarReais(PLANOS[id].precoCentavos)}/mês</span>
              </label>
            ))}
          </div>
          <Campo rotulo="Nome ou razão social (para a cobrança)" nome="nome" autoComplete="name" erro={estadoAssinar.erros?.nome} />
          <Campo rotulo="CPF ou CNPJ" nome="cpf_cnpj" inputMode="numeric" erro={estadoAssinar.erros?.cpf_cnpj} />
          <Botao type="submit" disabled={assinando}>
            {assinando ? "Preparando a cobrança..." : `Assinar o ${PLANOS[escolhido].nome}`}
          </Botao>
          <p className="text-xs text-suave">Você escolhe Pix, boleto ou cartão na próxima tela.</p>
        </Formulario>
      </Cartao>
    );
  }

  const outro: PlanoId = planoAtual === "essencial" ? "profissional" : "essencial";
  return (
    <Cartao className="space-y-3">
      {msg.erro && <Aviso>{msg.erro}</Aviso>}
      {msg.sucesso && <Aviso tipo="sucesso">{msg.sucesso}</Aviso>}
      {estadoTroca.erro && <Aviso>{estadoTroca.erro}</Aviso>}
      {estadoTroca.sucesso && <Aviso tipo="sucesso">{estadoTroca.sucesso}</Aviso>}
      <Botao type="button" disabled={ocupado} onClick={() => iniciar(async () => setMsg((await pagar()) ?? {}))}>
        Pagar agora
      </Botao>
      <Formulario acao={acaoTroca}>
        <input type="hidden" name="plano" value={planoProximo ? planoAtual : outro} />
        <Botao type="submit" variante="secundario" disabled={trocando}>
          {planoProximo
            ? `Continuar no ${PLANOS[planoAtual].nome}`
            : outro === "profissional"
              ? "Mudar para o Profissional"
              : "Mudar para o Essencial (na próxima cobrança)"}
        </Botao>
      </Formulario>
      {outro === "profissional" && statusAtivo && !planoProximo && (
        <p className="text-xs text-suave">Você paga só a diferença proporcional aos dias que faltam até a próxima cobrança.</p>
      )}
      <button
        type="button"
        disabled={ocupado}
        onClick={() => {
          if (confirm("Cancelar a renovação da assinatura? Seus dados ficam guardados e você pode voltar quando quiser.")) {
            iniciar(async () => setMsg(await cancelarAssinatura()));
          }
        }}
        className="mx-auto block text-sm font-semibold text-saida"
      >
        Cancelar assinatura
      </button>
    </Cartao>
  );
}
