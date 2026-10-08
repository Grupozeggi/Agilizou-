import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { sair } from "@/app/(auth)/acoes";

export default function LayoutAdmin({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-dvh flex-col bg-cartao">
      <header className="border-b border-royal-escuro bg-royal-escuro text-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/admin" className="flex items-center gap-2">
            <Logo claro className="text-xl" />
            <span className="flex items-center gap-1 rounded-full border border-dourado/50 px-2 py-0.5 text-xs text-dourado">
              <ShieldCheck className="size-3.5" strokeWidth={1.75} /> Admin
            </span>
          </Link>
          <form action={sair}>
            <button
              type="submit"
              className="grid size-10 place-items-center rounded-full hover:bg-white/10"
              aria-label="Sair"
              title="Sair"
            >
              <LogOut className="size-5" strokeWidth={1.75} />
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
