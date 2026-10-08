"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, CalendarClock, Home, Plus, Settings } from "lucide-react";

const ITENS = [
  { href: "/app", rotulo: "Início", icone: Home, exato: true },
  { href: "/app/lancamentos", rotulo: "Lançamentos", icone: ArrowLeftRight },
  { href: "/app/contas", rotulo: "Contas", icone: CalendarClock },
  { href: "/app/configuracoes", rotulo: "Ajustes", icone: Settings },
];

/** Barra inferior do app (mobile first) com o botão de lançar no meio. */
export function NavInferior() {
  const caminho = usePathname();
  const ativo = (href: string, exato?: boolean) =>
    exato ? caminho === href : caminho === href || (caminho.startsWith(href + "/") && !caminho.endsWith("/novo"));

  const [inicio, lancamentos, contas, ajustes] = ITENS.map((i) => (
    <Link
      key={i.href}
      href={i.href}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
        ativo(i.href, i.exato) ? "text-royal" : "text-suave"
      }`}
      aria-current={ativo(i.href, i.exato) ? "page" : undefined}
    >
      <i.icone className="size-6" strokeWidth={ativo(i.href, i.exato) ? 2 : 1.5} />
      {i.rotulo}
    </Link>
  ));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-borda bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      aria-label="Navegação principal"
    >
      <div className="mx-auto flex max-w-3xl items-end px-2">
        {inicio}
        {lancamentos}
        <div className="flex flex-1 justify-center">
          <Link
            href="/app/lancamentos/novo"
            aria-label="Novo lançamento"
            className="-mt-5 grid size-14 place-items-center rounded-full bg-royal-vivo text-white shadow-suave ring-4 ring-white hover:bg-royal"
          >
            <Plus className="size-7" strokeWidth={2} />
          </Link>
        </div>
        {contas}
        {ajustes}
      </div>
    </nav>
  );
}
