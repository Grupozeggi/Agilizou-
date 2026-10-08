"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

/** Erro inesperado em qualquer tela: mensagem clara e botão para tentar de novo. */
export default function Erro({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl">Algo deu errado</h1>
      <p className="mt-2 max-w-sm text-suave">
        Não conseguimos carregar esta tela. Confira sua internet e tente de novo. Seus dados estão seguros.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-royal-vivo px-6 font-semibold text-white hover:bg-royal"
      >
        <RefreshCw className="size-4" /> Tentar de novo
      </button>
      {error.digest && <p className="mt-4 text-xs text-suave">Código do erro: {error.digest}</p>}
    </main>
  );
}
