import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, CalendarDays, Contact, MessageCircle, Users, ArrowLeftRight, Boxes, CalendarClock, Settings, ShoppingCart, Tags, Wrench, type LucideIcon } from "lucide-react";
import { termosDoNicho } from "@/config/nichos";
import { exigirCliente } from "@/lib/sessao";

export const metadata: Metadata = { title: "Menu" };

type Item = { href: string; rotulo: string; icone: LucideIcon; descricao: string };

export default async function Menu() {
  const { empresa } = await exigirCliente();
  const t = termosDoNicho(empresa.nicho);
  const maiusc = (x: string) => x[0].toUpperCase() + x.slice(1);
  const grupos: { titulo: string; itens: Item[] }[] = [
    {
      titulo: "Dinheiro",
      itens: [
        { href: "/app/lancamentos", rotulo: "Lançamentos", icone: ArrowLeftRight, descricao: "Entradas e saídas do mês" },
        { href: "/app/contas", rotulo: "Contas", icone: CalendarClock, descricao: "A pagar e a receber" },
      ],
    },
    ...(empresa.agenda_ativa
      ? [
          {
            titulo: "Atendimentos",
            itens: [
              { href: "/app/agenda", rotulo: "Agenda", icone: CalendarDays, descricao: "Dia, semana e presença" },
              { href: "/app/profissionais", rotulo: maiusc(t.profissionais), icone: Users, descricao: "Quem atende" },
              { href: "/app/agenda/indicadores", rotulo: "Indicadores", icone: BarChart3, descricao: "Comparecimento, faltas e horas vagas" },
              { href: "/app/mensagens", rotulo: "Mensagens automáticas", icone: MessageCircle, descricao: "Lembretes de horário no WhatsApp" },
            ],
          },
        ]
      : []),
    {
      titulo: "Vendas e estoque",
      itens: [
        { href: "/app/vendas", rotulo: "Vendas", icone: ShoppingCart, descricao: "Histórico com lucro de cada venda" },
        { href: "/app/produtos", rotulo: "Produtos e estoque", icone: Boxes, descricao: "Cadastro, estoque baixo e etiquetas" },
        { href: "/app/servicos", rotulo: "Serviços", icone: Wrench, descricao: "Preço e duração" },
        { href: "/app/clientes", rotulo: maiusc(t.clientes), icone: Contact, descricao: "Cadastro, WhatsApp e histórico" },
      ],
    },
    {
      titulo: "Ajustes",
      itens: [
        { href: "/app/configuracoes/categorias", rotulo: "Categorias", icone: Tags, descricao: "Nomes das entradas e saídas" },
        { href: "/app/configuracoes/agenda", rotulo: "Agenda", icone: CalendarDays, descricao: empresa.agenda_ativa ? "Ligada · horário de atendimento" : "Desligada · toque para ligar" },
        { href: "/app/configuracoes", rotulo: "Ajustes e assinatura", icone: Settings, descricao: "Conta, plano e sair" },
      ],
    },
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl">Menu</h1>
      {grupos.map((g) => (
        <section key={g.titulo}>
          <h2 className="mb-2 px-1 text-sm font-medium text-suave">{g.titulo}</h2>
          <ul className="divide-y divide-borda overflow-hidden rounded-cartao bg-white shadow-suave">
            {g.itens.map((i) => (
              <li key={i.href}>
                <Link href={i.href} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-cartao">
                  <span className="grid size-10 place-items-center rounded-xl bg-royal-claro text-royal">
                    <i.icone className="size-5" strokeWidth={1.75} />
                  </span>
                  <span>
                    <span className="block font-medium text-tinta">{i.rotulo}</span>
                    <span className="block text-sm text-suave">{i.descricao}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
