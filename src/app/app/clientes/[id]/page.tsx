import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { z } from "zod";
import { Cartao } from "@/components/ui";
import { Voltar } from "@/components/voltar";
import { termosDoNicho } from "@/config/nichos";
import { partesSp, STATUS_AGENDA, type StatusAgenda } from "@/lib/agenda";
import { formatarData } from "@/lib/datas";
import { formatarReais, somar } from "@/lib/dinheiro";
import { linkWhatsapp } from "@/lib/mensagens";
import { exigirCliente } from "@/lib/sessao";
import { FormCliente } from "../form-cliente";
import { ExcluirCliente } from "./excluir";

export const metadata: Metadata = { title: "Cliente" };

export default async function DetalheCliente({ params }: PageProps<"/app/clientes/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase, empresa } = await exigirCliente();
  const t = termosDoNicho(empresa.nicho);

  const [{ data: cliente }, { data: atendimentos }, { data: vendas }, { data: pendentes }] = await Promise.all([
    supabase.from("clientes").select("id, nome, whatsapp, observacoes, aceita_mensagens").eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase
      .from("agendamentos")
      .select("id, inicio, status, servico:servicos(nome), profissional:profissionais(nome)")
      .eq("cliente_id", id)
      .is("deleted_at", null)
      .order("inicio", { ascending: false })
      .limit(50)
      .returns<{ id: string; inicio: string; status: StatusAgenda; servico: { nome: string } | null; profissional: { nome: string } | null }[]>(),
    supabase.from("vendas").select("id, numero, data, total_centavos").eq("cliente_id", id).is("deleted_at", null).order("data", { ascending: false }).limit(20),
    supabase.from("lancamentos").select("valor_centavos").eq("cliente_id", id).eq("tipo", "entrada").eq("status", "pendente").is("deleted_at", null),
  ]);
  if (!cliente) notFound();

  const faltas = (atendimentos ?? []).filter((a) => a.status === "faltou").length;
  const veio = (atendimentos ?? []).filter((a) => a.status === "compareceu").length;
  const aReceber = somar((pendentes ?? []).map((l) => l.valor_centavos));

  return (
    <div className="space-y-4">
      <Voltar href="/app/clientes">{t.clientes[0].toUpperCase() + t.clientes.slice(1)}</Voltar>
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl">{cliente.nome}</h1>
        {cliente.whatsapp && (
          <a
            href={linkWhatsapp(cliente.whatsapp, `Oi, ${cliente.nome.split(" ")[0]}, tudo bem?`)}
            target="_blank"
            rel="noopener noreferrer"
            className="grid size-11 place-items-center rounded-xl bg-entrada/10 text-entrada"
            aria-label="Abrir WhatsApp"
          >
            <MessageCircle className="size-5" />
          </a>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Cartao className="p-3">
          <p className="text-xs text-suave">Veio</p>
          <p className="numero font-semibold text-tinta">{veio}</p>
        </Cartao>
        <Cartao className="p-3">
          <p className="text-xs text-suave">Faltou</p>
          <p className={`numero font-semibold ${faltas ? "text-saida" : "text-tinta"}`}>{faltas}</p>
        </Cartao>
        <Cartao className="p-3">
          <p className="text-xs text-suave">A receber</p>
          <p className="numero truncate text-sm font-semibold text-entrada">{formatarReais(aReceber)}</p>
        </Cartao>
      </div>

      <Cartao className="p-4">
        <h2 className="text-base">Histórico de atendimentos</h2>
        {atendimentos?.length ? (
          <ul className="mt-2 divide-y divide-borda text-sm">
            {atendimentos.map((a) => {
              const { data, hora } = partesSp(a.inicio);
              return (
                <li key={a.id}>
                  <Link href={`/app/agenda/${a.id}`} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      <span className="numero text-tinta">
                        {formatarData(data)} {hora}
                      </span>
                      <span className="block text-xs text-suave">{[a.servico?.nome, a.profissional?.nome].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className={`text-xs font-semibold ${a.status === "faltou" ? "text-saida" : a.status === "compareceu" ? "text-entrada" : "text-suave"}`}>
                      {STATUS_AGENDA[a.status]}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-suave">Nenhum atendimento ainda.</p>
        )}
      </Cartao>

      {vendas && vendas.length > 0 && (
        <Cartao className="p-4">
          <h2 className="text-base">Compras</h2>
          <ul className="mt-2 divide-y divide-borda text-sm">
            {vendas.map((v) => (
              <li key={v.id}>
                <Link href={`/app/vendas/${v.id}`} className="flex justify-between py-2">
                  <span className="text-tinta">
                    #{v.numero} · {formatarData(v.data)}
                  </span>
                  <span className="numero font-semibold text-entrada">{formatarReais(v.total_centavos)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <details className="rounded-cartao bg-white p-4 shadow-suave">
        <summary className="cursor-pointer font-semibold text-tinta">Editar dados</summary>
        <div className="mt-4">
          <FormCliente cliente={cliente} termo={t.cliente} />
        </div>
      </details>
      <ExcluirCliente id={cliente.id} nome={cliente.nome} />
    </div>
  );
}
