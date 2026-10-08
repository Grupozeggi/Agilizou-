import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bell,
  Boxes,
  CalendarCheck,
  Check,
  MessageCircle,
  ScanBarcode,
  ShieldCheck,
  Smartphone,
  Wallet,
  X,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { LISTA_NICHOS } from "@/config/nichos";
import { PLANOS } from "@/config/planos";
import { formatarReais } from "@/lib/dinheiro";

export const metadata: Metadata = {
  title: "Agilizou. Seu caixa em dia.",
  description:
    "Gestão simples para pequenos negócios: caixa, contas a pagar e receber, estoque, vendas e agenda no celular. Teste grátis por 7 dias, sem cartão.",
  openGraph: {
    title: "Agilizou. Seu caixa em dia.",
    description: "Saiba para onde vai o dinheiro, quanto você lucra e o que tem em estoque. Direto no celular.",
    url: "https://agilizou.app",
    siteName: "Agilizou",
    locale: "pt_BR",
    type: "website",
  },
};

const RECURSOS = [
  { icone: Wallet, titulo: "Caixa em 10 segundos", texto: "Saldo, entradas, saídas e lucro do mês logo na primeira tela." },
  { icone: Bell, titulo: "Nada vence esquecido", texto: "Contas a pagar e a receber com aviso no celular e no e-mail." },
  { icone: Boxes, titulo: "Estoque que se mexe sozinho", texto: "A venda dá baixa no estoque e avisa quando está acabando." },
  { icone: ScanBarcode, titulo: "Bipou, vendeu", texto: "Código de barras automático, etiquetas e leitura pela câmera." },
  { icone: CalendarCheck, titulo: "Agenda sem furo", texto: "Horários, presença em um toque e quem mais falta." },
  { icone: MessageCircle, titulo: "Lembrete no WhatsApp", texto: "O cliente confirma, remarca ou cancela respondendo 1, 2 ou 3." },
  { icone: BarChart3, titulo: "Relatórios claros", texto: "Mais vendidos, margem, despesas e lucro mês a mês, em PDF ou planilha." },
  { icone: ShieldCheck, titulo: "Seus dados protegidos", texto: "Cada empresa só enxerga o que é dela. Nada é apagado." },
];

const PASSOS = [
  ["Crie sua conta", "Nome, e-mail e senha. Sem cartão."],
  ["Diga o tipo do negócio", "As categorias de entradas e saídas já vêm prontas."],
  ["Lance em 3 toques", "Valor, categoria, salvar. O resto o Agilizou calcula."],
];

const COMPARACAO: [string, string | boolean, string | boolean][] = [
  ["Lançamentos por mês", "300", "2.000"],
  ["Produtos", "100", "1.000"],
  ["Clientes", "200", "2.000"],
  ["Profissionais na agenda", "2", "10"],
  ["Relatórios exportáveis (PDF/planilha)", "1 por mês", "Ilimitados"],
  ["Cobrança pelo WhatsApp (botão)", true, true],
  ["Lembretes automáticos no WhatsApp", false, "Até 500/mês"],
  ["Estoque, vendas e código de barras", true, true],
  ["Agenda e controle de presença", true, true],
];

const PERGUNTAS = [
  ["Preciso entender de contabilidade?", "Não. O Agilizou fala a sua língua: entrou, saiu, sobrou. Sem termo de contador."],
  ["Funciona no celular?", "Foi feito para o celular. Dá até para instalar como aplicativo na tela inicial."],
  ["E se eu não assinar depois do teste?", "Seus dados ficam guardados e você pode consultar tudo. Só não dá para lançar coisa nova até assinar."],
  ["Emite nota fiscal?", "Não. O Agilizou cuida do caixa, das contas, do estoque, das vendas e da agenda."],
  ["Posso cancelar quando quiser?", "Pode. Sem multa e sem fidelidade. Você usa até o fim do período pago."],
];

export default function Landing() {
  return (
    <div className="flex min-h-dvh flex-col bg-fundo">
      <header className="sticky top-0 z-20 border-b border-borda/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
          <Logo />
          <nav className="flex items-center gap-2 text-sm font-semibold">
            <a href="#planos" className="hidden px-3 py-2 text-texto hover:text-royal sm:block">
              Planos
            </a>
            <Link href="/entrar" className="px-3 py-2 text-royal hover:underline">
              Entrar
            </Link>
            <Link href="/cadastro" className="hidden h-10 items-center rounded-xl bg-royal-vivo px-4 text-white hover:bg-royal sm:inline-flex">
              Testar grátis
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Abertura */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-14 sm:py-20 lg:grid-cols-2">
          <div>
            <p className="mb-4 inline-block border-b border-dourado pb-1 text-sm font-medium text-royal-escuro">
              Para mecânicas, clínicas, salões, barbearias e lojas
            </p>
            <h1 className="text-4xl leading-tight sm:text-5xl">Agilizou. Seu caixa em dia.</h1>
            <p className="mt-4 max-w-xl text-lg text-suave">
              Saiba para onde vai o dinheiro, quanto você lucra e o que tem em estoque. Direto no celular, sem termo de contador.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/cadastro" className="inline-flex h-12 items-center gap-2 rounded-xl bg-royal-vivo px-6 font-semibold text-white shadow-suave hover:bg-royal">
                Testar grátis <ArrowRight className="size-5" strokeWidth={1.75} />
              </Link>
              <span className="text-sm text-suave">7 dias grátis · sem cartão · cancele quando quiser</span>
            </div>
          </div>
          <TelaExemplo />
        </section>

        {/* Recursos */}
        <section className="bg-cartao py-16">
          <div className="mx-auto w-full max-w-6xl px-4">
            <h2 className="text-3xl">Tudo o que o dono precisa, nada do que atrapalha</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {RECURSOS.map(({ icone: Icone, titulo, texto }) => (
                <div key={titulo} className="rounded-cartao bg-white p-5 shadow-suave">
                  <Icone className="size-6 text-dourado" strokeWidth={1.5} />
                  <h3 className="mt-3 text-base">{titulo}</h3>
                  <p className="mt-1 text-sm text-suave">{texto}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Como funciona */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16">
          <h2 className="text-3xl">Comece em menos de um minuto</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            {PASSOS.map(([t, d], i) => (
              <li key={t} className="rounded-cartao border border-borda p-5">
                <span className="numero grid size-9 place-items-center rounded-full bg-royal-claro font-semibold text-royal">{i + 1}</span>
                <h3 className="mt-3 text-base">{t}</h3>
                <p className="mt-1 text-sm text-suave">{d}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap gap-2">
            {LISTA_NICHOS.map((n) => (
              <span key={n.id} className="rounded-full border border-borda px-4 py-2 text-sm text-texto">
                {n.nome}
              </span>
            ))}
          </div>
        </section>

        {/* Planos */}
        <section id="planos" className="scroll-mt-16 bg-cartao py-16">
          <div className="mx-auto w-full max-w-4xl px-4">
            <h2 className="text-center text-3xl">Planos simples, sem surpresa</h2>
            <p className="mt-2 text-center text-suave">Comece com 7 dias grátis. Escolha o plano só no fim do teste.</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {Object.values(PLANOS).map((p) => (
                <div
                  key={p.id}
                  className={`relative rounded-cartao bg-white p-6 shadow-suave ${p.destaque ? "ring-2 ring-dourado" : "ring-1 ring-borda"}`}
                >
                  {p.destaque && (
                    <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-royal-escuro px-3 py-1 text-xs font-semibold text-dourado">
                      <BadgeCheck className="size-3.5" /> Mais completo
                    </span>
                  )}
                  <h3 className="text-xl">{p.nome}</h3>
                  <p className="mt-2">
                    <span className="numero text-4xl font-semibold text-tinta">{formatarReais(p.precoCentavos).replace(",00", "")}</span>
                    <span className="text-suave">/mês</span>
                  </p>
                  <p className="mt-2 text-sm text-suave">
                    {p.destaque ? "Para quem tem agenda cheia e quer lembrete automático no WhatsApp." : "Para organizar caixa, contas, estoque e vendas."}
                  </p>
                  <Link
                    href="/cadastro"
                    className={`mt-5 flex h-12 items-center justify-center rounded-xl font-semibold ${
                      p.destaque ? "bg-royal-vivo text-white hover:bg-royal" : "border border-borda text-royal hover:bg-cartao"
                    }`}
                  >
                    Testar grátis
                  </Link>
                </div>
              ))}
            </div>

            <div className="mt-8 overflow-x-auto rounded-cartao bg-white shadow-suave">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-borda text-left">
                    <th className="px-4 py-3 font-semibold text-tinta">O que vem</th>
                    <th className="px-4 py-3 text-center font-semibold text-tinta">Essencial</th>
                    <th className="bg-dourado/10 px-4 py-3 text-center font-semibold text-tinta">Profissional</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {COMPARACAO.map(([item, e, p]) => (
                    <tr key={item}>
                      <td className="px-4 py-3 text-texto">{item}</td>
                      <Celula valor={e} />
                      <Celula valor={p} destaque />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-center text-xs text-suave">Pagamento por Pix, boleto ou cartão. Troque de plano quando quiser.</p>
          </div>
        </section>

        {/* Perguntas */}
        <section className="mx-auto w-full max-w-3xl px-4 py-16">
          <h2 className="text-3xl">Perguntas frequentes</h2>
          <div className="mt-6 divide-y divide-borda rounded-cartao border border-borda">
            {PERGUNTAS.map(([p, r]) => (
              <details key={p} className="group p-5">
                <summary className="cursor-pointer list-none font-semibold text-tinta">
                  <span className="mr-2 text-dourado group-open:hidden">+</span>
                  <span className="mr-2 hidden text-dourado group-open:inline">−</span>
                  {p}
                </summary>
                <p className="mt-2 text-suave">{r}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="bg-royal-escuro py-14 text-center text-white">
          <div className="mx-auto max-w-2xl px-4">
            <Smartphone className="mx-auto size-8 text-dourado" strokeWidth={1.5} />
            <h2 className="mt-3 text-3xl text-white">Seu caixa em dia, a partir de hoje.</h2>
            <Link href="/cadastro" className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 font-semibold text-royal hover:bg-royal-claro">
              Testar grátis por 7 dias <ArrowRight className="size-5" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-borda py-8 text-center text-sm text-suave">
        <Logo className="text-lg" />
        <p className="mt-2">
          <Link href="/termos" className="hover:underline">
            Termos de Uso
          </Link>{" "}
          ·{" "}
          <Link href="/privacidade" className="hover:underline">
            Privacidade
          </Link>{" "}
          · agilizou.app
        </p>
      </footer>
    </div>
  );
}

function Celula({ valor, destaque }: { valor: string | boolean; destaque?: boolean }) {
  return (
    <td className={`px-4 py-3 text-center ${destaque ? "bg-dourado/10 font-medium text-tinta" : "text-texto"}`}>
      {valor === true ? (
        <Check className="mx-auto size-5 text-entrada" aria-label="Sim" />
      ) : valor === false ? (
        <X className="mx-auto size-5 text-suave/60" aria-label="Não" />
      ) : (
        valor
      )}
    </td>
  );
}

/** Ilustração da tela inicial do app (sem imagem: só HTML). */
function TelaExemplo() {
  return (
    <div className="mx-auto w-full max-w-sm rounded-[2rem] border-8 border-royal-escuro bg-cartao p-4 shadow-suave" aria-hidden="true">
      <div className="rounded-cartao bg-royal-escuro p-4 text-white">
        <p className="text-xs text-white/70">Saldo atual do caixa</p>
        <p className="numero text-3xl font-semibold">R$ 12.480,90</p>
        <div className="mt-2 h-px w-10 bg-dourado" />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          ["Entradas", "R$ 18.320", "text-entrada"],
          ["Saídas", "R$ 9.870", "text-saida"],
          ["Lucro", "R$ 8.450", "text-tinta"],
        ].map(([r, v, c]) => (
          <div key={r} className="rounded-xl bg-white p-2 shadow-suave">
            <p className="text-[10px] text-suave">{r}</p>
            <p className={`numero text-xs font-semibold ${c}`}>{v}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-xl bg-white p-3 shadow-suave">
        <p className="text-xs font-semibold text-tinta">Para hoje</p>
        {[
          ["Pagar aluguel", "R$ 1.500,00"],
          ["Cobrar Carlos", "R$ 250,00"],
          ["14:00 · Corte · Ana", ""],
        ].map(([t, v]) => (
          <div key={t} className="mt-2 flex justify-between text-xs">
            <span className="text-texto">{t}</span>
            <span className="numero text-suave">{v}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-end gap-1.5 rounded-xl bg-white p-3 shadow-suave">
        {[40, 55, 35, 62, 48, 75].map((h, i) => (
          <div key={i} className={`flex-1 rounded-t ${i === 5 ? "bg-dourado" : "bg-royal-vivo"}`} style={{ height: `${h}px` }} />
        ))}
      </div>
    </div>
  );
}
