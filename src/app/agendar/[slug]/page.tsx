import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { connection } from "next/server";
import { CalendarOff } from "lucide-react";
import { Logo } from "@/components/logo";
import { Cartao } from "@/components/ui";
import { termosDoNicho } from "@/config/nichos";
import type { AgendaPublica } from "@/lib/agendamento-online";
import { hojeIso } from "@/lib/datas";
import { criarClientePublico } from "@/lib/supabase/publico";
import { FormAgendar } from "./form";

/**
 * Página pública do link de agendamento: agilizou.app/agendar/<empresa>.
 * Não exige login. Só mostra o que a função agenda_publica() devolve.
 */
const carregar = cache(async (slug: string): Promise<AgendaPublica | null> => {
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) return null;
  const { data, error } = await criarClientePublico().rpc("agenda_publica", { p_slug: slug });
  if (error) {
    console.error("[agendar online] leitura", error);
    return null;
  }
  return (data as AgendaPublica | null) ?? null;
});

export async function generateMetadata({ params }: PageProps<"/agendar/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const agenda = await carregar(slug.toLowerCase());
  if (!agenda) return { title: "Agendamento", robots: { index: false } };
  return {
    title: `Agendar em ${agenda.empresa.nome}`,
    description: `Escolha o dia e o horário e marque seu atendimento em ${agenda.empresa.nome}.`,
  };
}

export default async function Agendar({ params }: PageProps<"/agendar/[slug]">) {
  // Os horários livres mudam a todo momento: sempre monta na hora do acesso.
  await connection();
  const { slug } = await params;
  const agenda = await carregar(slug.toLowerCase());

  return (
    <main className="flex min-h-dvh flex-col items-center bg-cartao px-4 py-6">
      <div className="w-full max-w-md flex-1">
        {agenda ? (
          <>
            <header className="mb-5 flex items-center gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-royal text-xl font-bold text-white" aria-hidden="true">
                {agenda.empresa.nome.trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <h1 className="break-words text-xl leading-tight">{agenda.empresa.nome}</h1>
                <p className="text-sm text-suave">Agende seu horário</p>
              </div>
            </header>
            {agenda.empresa.mensagem && (
              <p className="mb-4 whitespace-pre-line rounded-xl border border-borda bg-white px-4 py-3 text-sm text-texto">{agenda.empresa.mensagem}</p>
            )}
            <FormAgendar
              slug={slug.toLowerCase()}
              agenda={agenda}
              termos={termosDoNicho(agenda.empresa.nicho)}
              hoje={hojeIso()}
              agoraIso={new Date().toISOString()}
            />
          </>
        ) : (
          <Cartao className="mt-10 text-center">
            <CalendarOff className="mx-auto size-8 text-suave" />
            <h1 className="mt-2 text-xl">Agendamento indisponível</h1>
            <p className="mt-1 text-sm text-suave">
              Este link não está recebendo agendamentos no momento. Fale direto com a empresa para marcar o seu horário.
            </p>
          </Cartao>
        )}
      </div>
      <footer className="mt-8 text-center text-xs text-suave">
        <Link href="/" className="inline-flex items-center gap-1.5">
          Agenda feita com <Logo className="text-sm" />
        </Link>
      </footer>
    </main>
  );
}
