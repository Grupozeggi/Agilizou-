"use client";

import { Eye, EyeOff } from "lucide-react";
import type { ComponentProps } from "react";
import { useState } from "react";

/**
 * Campo de senha com o botão de olho: mostra ou esconde o que foi digitado.
 * É usado automaticamente pelo <Campo type="password" /> de ui.tsx.
 */
export function CampoSenha({
  rotulo,
  nome,
  erro,
  ajuda,
  ...props
}: ComponentProps<"input"> & { rotulo: string; nome: string; erro?: string; ajuda?: string }) {
  const [visivel, setVisivel] = useState(false);
  const idErro = erro ? `${nome}-erro` : undefined;
  return (
    <div>
      <label htmlFor={nome} className="mb-1.5 block text-sm font-medium text-tinta">
        {rotulo}
      </label>
      <div className="relative">
        <input
          name={nome}
          id={nome}
          aria-invalid={erro ? true : undefined}
          aria-describedby={idErro}
          className="h-12 w-full rounded-xl border border-borda bg-white pl-4 pr-12 text-base text-texto outline-none transition-colors placeholder:text-suave/60 focus:border-royal-vivo focus:ring-2 focus:ring-royal-vivo/20 aria-invalid:border-saida"
          {...props}
          type={visivel ? "text" : "password"}
        />
        <button
          type="button"
          onClick={() => setVisivel((atual) => !atual)}
          aria-label={visivel ? "Esconder a senha" : "Mostrar a senha"}
          aria-pressed={visivel}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-suave transition-colors hover:text-royal-vivo focus-visible:outline-2 focus-visible:outline-royal-vivo"
        >
          {visivel ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
      {erro ? (
        <span id={idErro} className="mt-1 block text-sm text-saida">
          {erro}
        </span>
      ) : ajuda ? (
        <span className="mt-1 block text-sm text-suave">{ajuda}</span>
      ) : null}
    </div>
  );
}
