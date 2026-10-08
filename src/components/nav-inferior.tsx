"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowDownLeft, Bell, ArrowUpRight, CalendarClock, Home, LayoutGrid, Plus, ShoppingCart, X, type LucideIcon } from "lucide-react";

type Item = { href: string; rotulo: string; icone: LucideIcon; exato?: boolean };

const ESQUERDA: Item[] = [
  { href: "/app", rotulo: "Início", icone: Home, exato: true },
  { href: "/app/hoje", rotulo: "Hoje", icone: CalendarClock },
];
const DIREITA: Item[] = [
  { href: "/app/vendas", rotulo: "Vendas", icone: ShoppingCart },
  { href: "/app/menu", rotulo: "Menu", icone: LayoutGrid },
];

export type AcaoRapida = { href: string; rotulo: string; icone: "venda" | "entrada" | "saida" | "agenda" | "lembrete" };

const ACOES_PADRAO: AcaoRapida[] = [
  { href: "/app/vendas/nova", rotulo: "Venda", icone: "venda" },
  { href: "/app/lancamentos/novo?tipo=entrada", rotulo: "Entrada", icone: "entrada" },
  { href: "/app/lancamentos/novo?tipo=saida", rotulo: "Saída", icone: "saida" },
  { href: "/app/lembretes", rotulo: "Lembrete", icone: "lembrete" },
];

const ICONES: Record<AcaoRapida["icone"], { icone: LucideIcon; cor: string }> = {
  venda: { icone: ShoppingCart, cor: "text-royal" },
  entrada: { icone: ArrowDownLeft, cor: "text-entrada" },
  saida: { icone: ArrowUpRight, cor: "text-saida" },
  agenda: { icone: CalendarClock, cor: "text-royal" },
  lembrete: { icone: Bell, cor: "text-dourado" },
};

/** Barra inferior do app (mobile first) com o botão "+" no meio. */
export function NavInferior({ agenda = false }: { agenda?: boolean }) {
  const acoes = agenda ? [...ACOES_PADRAO, { href: "/app/agenda/novo", rotulo: "Agendar", icone: "agenda" as const }] : ACOES_PADRAO;
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);
  const ativo = (i: Item) =>
    i.exato ? caminho === i.href : caminho === i.href || (caminho.startsWith(i.href + "/") && !caminho.endsWith("/nova"));

  const link = (i: Item) => (
    <Link
      key={i.href}
      href={i.href}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${ativo(i) ? "text-royal" : "text-suave"}`}
      aria-current={ativo(i) ? "page" : undefined}
    >
      <i.icone className="size-6" strokeWidth={ativo(i) ? 2 : 1.5} />
      {i.rotulo}
    </Link>
  );

  return (
    <>
      {aberto && (
        <div className="fixed inset-0 z-30 bg-royal-escuro/40 print:hidden" onClick={() => setAberto(false)}>
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="O que você quer lançar?"
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="font-semibold text-tinta">O que você quer lançar?</p>
              <button type="button" onClick={() => setAberto(false)} className="grid size-10 place-items-center text-suave" aria-label="Fechar">
                <X className="size-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {acoes.map((a) => {
                const { icone: Icone, cor } = ICONES[a.icone];
                return (
                  <Link
                    key={a.href}
                    href={a.href}
                    onClick={() => setAberto(false)}
                    className="flex flex-col items-center gap-2 rounded-2xl bg-cartao py-4 text-sm font-semibold text-tinta"
                  >
                    <Icone className={`size-6 ${cor}`} strokeWidth={1.75} />
                    {a.rotulo}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-borda bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur print:hidden"
        aria-label="Navegação principal"
      >
        <div className="mx-auto flex max-w-3xl items-end px-2">
          {ESQUERDA.map(link)}
          <div className="flex flex-1 justify-center">
            <button
              type="button"
              onClick={() => setAberto(true)}
              aria-label="Lançar"
              aria-haspopup="dialog"
              className="-mt-5 grid size-14 place-items-center rounded-full bg-royal-vivo text-white shadow-suave ring-4 ring-white hover:bg-royal"
            >
              <Plus className="size-7" strokeWidth={2} />
            </button>
          </div>
          {DIREITA.map(link)}
        </div>
      </nav>
    </>
  );
}
