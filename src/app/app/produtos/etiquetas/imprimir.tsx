"use client";

import { Printer } from "lucide-react";

export function BotaoImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-royal-vivo px-4 text-sm font-semibold text-white"
    >
      <Printer className="size-4" /> Imprimir
    </button>
  );
}
