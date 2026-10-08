import Link from "next/link";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/logo";
import { exigirCliente } from "@/lib/sessao";
import { sair } from "@/app/(auth)/acoes";

export default async function LayoutApp({ children }: LayoutProps<"/app">) {
  const { empresa } = await exigirCliente();

  return (
    <div className="flex min-h-dvh flex-col bg-cartao">
      <header className="sticky top-0 z-10 border-b border-borda bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/app" aria-label="Início">
            <Logo className="text-xl" />
          </Link>
          <div className="flex items-center gap-3">
            <span className="max-w-[45vw] truncate text-sm font-medium text-tinta">{empresa.nome}</span>
            <form action={sair}>
              <button
                type="submit"
                className="grid size-10 place-items-center rounded-full text-suave hover:bg-cartao hover:text-tinta"
                aria-label="Sair"
                title="Sair"
              >
                <LogOut className="size-5" strokeWidth={1.75} />
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
