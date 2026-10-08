import Link from "next/link";
import { ArrowRight, Boxes, CalendarCheck, Wallet } from "lucide-react";
import { Logo } from "@/components/logo";

// Landing provisória. A versão completa (com tabela de planos) vem na etapa 12.
export default function Landing() {
  const itens = [
    { icone: Wallet, titulo: "Seu caixa em 10 segundos", texto: "Saldo, entradas, saídas e lucro do mês na primeira tela." },
    { icone: Boxes, titulo: "Estoque sem planilha", texto: "Venda dá baixa sozinha e avisa quando está acabando." },
    { icone: CalendarCheck, titulo: "Agenda e cobranças", texto: "Contas a pagar, a receber e atendimentos do dia." },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
        <Logo />
        <Link href="/entrar" className="text-sm font-semibold text-royal hover:underline">
          Entrar
        </Link>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4">
        <section className="py-12 sm:py-20">
          <p className="mb-4 inline-block border-b border-dourado pb-1 text-sm font-medium text-royal-escuro">
            Para mecânicas, clínicas, salões e lojas
          </p>
          <h1 className="max-w-2xl text-4xl leading-tight sm:text-5xl">
            Agilizou. Seu caixa em dia.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-suave">
            Saiba para onde vai o dinheiro, quanto você lucra e o que tem em estoque. Direto no celular,
            sem termos de contador.
          </p>
          <Link
            href="/cadastro"
            className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-royal-vivo px-6 font-semibold text-white hover:bg-royal"
          >
            Testar grátis <ArrowRight className="size-5" strokeWidth={1.75} />
          </Link>
          <p className="mt-3 text-sm text-suave">7 dias grátis, sem cartão.</p>
        </section>

        <section className="grid gap-4 pb-16 sm:grid-cols-3">
          {itens.map(({ icone: Icone, titulo, texto }) => (
            <div key={titulo} className="rounded-cartao bg-cartao p-6">
              <Icone className="size-6 text-dourado" strokeWidth={1.5} />
              <h2 className="mt-3 text-lg">{titulo}</h2>
              <p className="mt-1 text-sm text-suave">{texto}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-borda py-6 text-center text-sm text-suave">
        <Link href="/termos" className="hover:underline">Termos de Uso</Link> ·{" "}
        <Link href="/privacidade" className="hover:underline">Privacidade</Link> · agilizou.app
      </footer>
    </div>
  );
}
