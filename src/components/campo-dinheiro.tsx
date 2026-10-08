"use client";

import { useState } from "react";

/**
 * Campo de valor em R$ pensado para o celular: abre o teclado numérico e
 * preenche da direita para a esquerda (digitar 1, 5, 0, 0 mostra 15,00).
 * Envia no formulário o texto "1.234,56"; o servidor converte para centavos.
 */
export function CampoDinheiro({
  nome,
  rotulo,
  valorInicialCentavos = 0,
  erro,
  ajuda,
  permitirNegativo = false,
  autoFocus,
}: {
  nome: string;
  rotulo: string;
  valorInicialCentavos?: number;
  erro?: string;
  ajuda?: string;
  permitirNegativo?: boolean;
  autoFocus?: boolean;
}) {
  const [centavos, setCentavos] = useState(Math.abs(valorInicialCentavos));
  const [negativo, setNegativo] = useState(valorInicialCentavos < 0);

  const texto = formatar(centavos);
  const idErro = erro ? `${nome}-erro` : undefined;

  return (
    <div>
      <label htmlFor={nome} className="mb-1.5 block text-sm font-medium text-tinta">
        {rotulo}
      </label>
      <div
        className={`flex h-14 items-center rounded-xl border bg-white px-4 focus-within:ring-2 focus-within:ring-royal-vivo/20 ${
          erro ? "border-saida" : "border-borda focus-within:border-royal-vivo"
        }`}
      >
        <span className={`mr-2 text-lg ${negativo ? "text-saida" : "text-suave"}`}>{negativo ? "-R$" : "R$"}</span>
        <input
          id={nome}
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          aria-invalid={erro ? true : undefined}
          aria-describedby={idErro}
          value={texto}
          onChange={(e) => {
            // Não confiamos na posição do cursor: cada dígito digitado entra
            // sempre no fim e apagar remove sempre o último (como em app de banco).
            const evento = e.nativeEvent as InputEvent;
            const atual = String(centavos);
            let digitos: string;
            if (evento.inputType?.startsWith("delete")) {
              digitos = atual.slice(0, -1);
            } else if (evento.inputType === "insertText" && evento.data) {
              digitos = atual + evento.data.replace(/\D/g, "");
            } else {
              // colar, autocompletar etc.: usa o que ficou no campo
              digitos = e.target.value.replace(/\D/g, "");
            }
            digitos = digitos.replace(/^0+/, "").slice(0, 13);
            setCentavos(Number(digitos || "0"));
          }}
          onFocus={(e) => moverCursorParaFim(e.currentTarget)}
          onClick={(e) => moverCursorParaFim(e.currentTarget)}
          onKeyUp={(e) => moverCursorParaFim(e.currentTarget)}
          className={`numero w-full bg-transparent text-2xl font-semibold outline-none ${negativo ? "text-saida" : "text-tinta"}`}
        />
      </div>
      <input type="hidden" name={nome} value={(negativo && centavos > 0 ? "-" : "") + texto} />
      {erro ? (
        <p id={idErro} className="mt-1 text-sm text-saida">
          {erro}
        </p>
      ) : ajuda ? (
        <p className="mt-1 text-sm text-suave">{ajuda}</p>
      ) : null}
      {permitirNegativo && (
        <label className="mt-3 flex items-center gap-3 text-sm text-suave">
          <input
            type="checkbox"
            checked={negativo}
            onChange={(e) => setNegativo(e.target.checked)}
            className="size-5 accent-royal-vivo"
          />
          O caixa está negativo
        </label>
      )}
    </div>
  );
}

function moverCursorParaFim(campo: HTMLInputElement) {
  const fim = campo.value.length;
  requestAnimationFrame(() => campo.setSelectionRange(fim, fim));
}

/** 123456 → "1.234,56" (sem passar por float). */
function formatar(centavos: number) {
  const s = String(centavos).padStart(3, "0");
  const inteiro = s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${inteiro},${s.slice(-2)}`;
}
