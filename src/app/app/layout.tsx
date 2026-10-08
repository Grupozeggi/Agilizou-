import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/logo";
import { NavInferior } from "@/components/nav-inferior";
import { mensagemSomenteLeitura } from "@/lib/assinatura";
import { exigirCliente } from "@/lib/sessao";
import { sair } from "@/app/(auth)/acoes";
import { sairModoSuporte } from "@/app/admin/acoes";

export default async function LayoutApp({ children }: LayoutProps<"/app">) {
  const { empresa, suporte, supabase } = await exigirCliente();
  // Quem ainda não respondeu as 3 perguntas iniciais vai para o onboarding.
  if (!empresa.onboarding_concluido) redirect("/boas-vindas");
  const bloqueio = mensagemSomenteLeitura(empresa.status_assinatura, empresa.teste_ate);
  if (!suporte) await supabase.rpc("registrar_acesso");

  return (
    <div className="flex min-h-dvh flex-col bg-cartao">
      {suporte && (
        <div className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-dourado px-4 py-2 text-sm font-semibold text-royal-escuro print:hidden" role="status">
          <span>
            Modo suporte: você está na conta de {empresa.nome}
          </span>
          <form action={sairModoSuporte}>
            <button type="submit" className="rounded-lg bg-royal-escuro px-3 py-1.5 text-xs text-white">
              Sair do modo suporte
            </button>
          </form>
        </div>
      )}
      <header className="sticky top-0 z-10 border-b border-borda bg-white/90 backdrop-blur print:hidden">
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
      {bloqueio && (
        <Link href="/app/assinatura" className="block bg-dourado/15 px-4 py-2.5 text-center text-sm text-royal-escuro print:hidden">
          {bloqueio} <strong className="underline">Ver planos</strong>
        </Link>
      )}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-6">{children}</main>
      <NavInferior agenda={empresa.agenda_ativa} />
    </div>
  );
}
