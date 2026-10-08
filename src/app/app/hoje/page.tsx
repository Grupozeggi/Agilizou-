import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Plus } from "lucide-react";
import { exigirCliente } from "@/lib/sessao";
import { montarAgenda, type ItemAgenda } from "@/lib/agenda-dia";
import { hojeIso, somarDias } from "@/lib/datas";
import { estoqueBaixo } from "@/lib/estoque";
import { listarProdutos } from "../produtos/dados";
import { ListaHoje } from "./lista";

export const metadata: Metadata = { title: "Hoje" };

type Cli = { nome: string; whatsapp: string | null } | null;

export default async function Hoje({ searchParams }: PageProps<"/app/hoje">) {
  const p = await searchParams;
  const semana = p.visao === "semana";
  const hoje = hojeIso();
  const fim = somarDias(hoje, semana ? 6 : 0);
  const { supabase, empresa } = await exigirCliente();

  const [contas, lembretes, atendimentos, produtos] = await Promise.all([
    supabase
      .from("lancamentos")
      .select("id, tipo, valor_centavos, data, descricao, categoria:categorias(nome), cliente:clientes(nome, whatsapp)")
      .is("deleted_at", null)
      .eq("status", "pendente")
      .lte("data", fim)
      .order("data")
      .range(0, 499)
      .returns<{ id: string; tipo: "entrada" | "saida"; valor_centavos: number; data: string; descricao: string | null; categoria: { nome: string } | null; cliente: Cli }[]>(),
    supabase
      .from("lembretes")
      .select("id, titulo, data, tipo, valor_centavos, cliente:clientes(nome, whatsapp)")
      .is("deleted_at", null)
      .eq("feito", false)
      .lte("data", fim)
      .order("data")
      .range(0, 499)
      .returns<{ id: string; titulo: string; data: string; tipo: "pagar" | "cobrar" | "outro"; valor_centavos: number | null; cliente: Cli }[]>(),
    supabase
      .from("agendamentos")
      .select("id, inicio, status, cliente:clientes(nome, whatsapp), profissional:profissionais(nome), servico:servicos(nome)")
      .is("deleted_at", null)
      .in("status", ["agendado", "confirmado"])
      .gte("inicio", `${hoje}T00:00:00-03:00`)
      .lte("inicio", `${fim}T23:59:59-03:00`)
      .order("inicio")
      .returns<{ id: string; inicio: string; status: string; cliente: Cli; profissional: { nome: string } | null; servico: { nome: string } | null }[]>(),
    listarProdutos(supabase),
  ]);

  const itens: ItemAgenda[] = [
    ...(contas.data ?? []).map((c) => ({
      id: c.id,
      tipo: (c.tipo === "saida" ? "pagar" : "receber") as ItemAgenda["tipo"],
      data: c.data,
      titulo: c.descricao || c.categoria?.nome || (c.tipo === "saida" ? "Conta a pagar" : "Conta a receber"),
      detalhe: c.cliente?.nome,
      valor_centavos: c.valor_centavos,
      cliente: c.cliente,
    })),
    ...(lembretes.data ?? []).map((l) => ({
      id: l.id,
      tipo: "lembrete" as const,
      subtipo: l.tipo,
      data: l.data,
      titulo: l.titulo,
      detalhe: l.cliente?.nome,
      valor_centavos: l.valor_centavos,
      cliente: l.cliente,
    })),
    ...(atendimentos.data ?? []).map((a) => {
      const dt = new Date(a.inicio);
      const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", ...o }).format(dt);
      return {
        id: a.id,
        tipo: "atendimento" as const,
        data: fmt({ year: "numeric", month: "2-digit", day: "2-digit" }),
        hora: fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
        titulo: a.cliente?.nome ?? "Atendimento",
        detalhe: [a.servico?.nome, a.profissional?.nome].filter(Boolean).join(" · "),
        cliente: a.cliente,
      };
    }),
  ];
  const agenda = montarAgenda(itens, hoje, semana ? 7 : 1);
  const baixos = produtos.filter((x) => estoqueBaixo(x.estoque, x.estoque_minimo));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl">{semana ? "Próximos 7 dias" : "Hoje"}</h1>
        <Link href="/app/lembretes" className="inline-flex h-10 items-center gap-1 rounded-xl bg-royal-vivo px-4 text-sm font-semibold text-white">
          <Plus className="size-4" /> Lembrete
        </Link>
      </div>
      <nav className="grid grid-cols-2 gap-1 rounded-xl bg-white p-1 shadow-suave">
        {[
          ["dia", "Dia", "/app/hoje"],
          ["semana", "Semana", "/app/hoje?visao=semana"],
        ].map(([v, r, href]) => (
          <Link
            key={v}
            href={href}
            className={`flex h-10 items-center justify-center rounded-lg text-sm font-semibold ${(v === "semana") === semana ? "bg-royal-vivo text-white" : "text-suave"}`}
          >
            {r}
          </Link>
        ))}
      </nav>

      {baixos.length > 0 && (
        <Link href="/app/produtos?filtro=baixo" className="flex items-center gap-3 rounded-cartao bg-white p-4 shadow-suave ring-1 ring-saida/30">
          <AlertTriangle className="size-5 text-saida" strokeWidth={1.75} />
          <span className="flex-1 text-sm text-texto">
            <strong className="text-saida">{baixos.length} {baixos.length === 1 ? "produto" : "produtos"}</strong> com estoque baixo:{" "}
            {baixos.slice(0, 3).map((x) => x.nome).join(", ")}
            {baixos.length > 3 ? "…" : ""}
          </span>
          <ChevronRight className="size-4 text-suave" />
        </Link>
      )}

      <ListaHoje agenda={agenda} hoje={hoje} empresa={empresa.nome} />
    </div>
  );
}
