import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, ShoppingCart } from "lucide-react";
import { z } from "zod";
import { Cartao } from "@/components/ui";
import { Voltar } from "@/components/voltar";
import { partesSp, STATUS_AGENDA } from "@/lib/agenda";
import { formatarData, hojeIso } from "@/lib/datas";
import { formatarReais } from "@/lib/dinheiro";
import { linkWhatsapp } from "@/lib/mensagens";
import { exigirCliente } from "@/lib/sessao";
import { CAMPOS_ATENDIMENTO, type Atendimento } from "../dados";
import { AcoesAtendimento } from "./acoes-atendimento";

export const metadata: Metadata = { title: "Atendimento" };

export default async function DetalheAtendimento({ params }: PageProps<"/app/agenda/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase, empresa } = await exigirCliente();
  const { data: a } = await supabase.from("agendamentos").select(CAMPOS_ATENDIMENTO).eq("id", id).is("deleted_at", null).maybeSingle<Atendimento>();
  if (!a) notFound();
  const { data, hora } = partesSp(a.inicio);
  const fim = partesSp(a.fim).hora;
  const { data: msgs } = await supabase
    .from("mensagens_whatsapp")
    .select("id, etapa, status, agendado_para")
    .eq("agendamento_id", id)
    .order("agendado_para");

  return (
    <div className="space-y-4">
      <Voltar href={`/app/agenda?dia=${data}`}>Agenda</Voltar>
      <div>
        <p className="text-sm text-suave">{STATUS_AGENDA[a.status]}</p>
        <h1 className="text-2xl">{a.cliente?.nome}</h1>
      </div>
      <Cartao className="space-y-1 p-4 text-sm">
        <p className="numero font-semibold text-tinta">
          {formatarData(data)} · {hora} às {fim}
        </p>
        <p className="text-texto">{[a.servico?.nome, a.profissional?.nome].filter(Boolean).join(" · ")}</p>
        {a.servico && <p className="numero text-suave">{formatarReais(a.servico.preco_centavos)}</p>}
        {a.observacao && <p className="text-suave">{a.observacao}</p>}
      </Cartao>
      {a.cliente?.whatsapp && (
        <a
          href={linkWhatsapp(a.cliente.whatsapp, `Oi, ${a.cliente.nome.split(" ")[0]}! Seu horário na ${empresa.nome} é ${formatarData(data)} às ${hora}.`)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-entrada/10 font-semibold text-entrada"
        >
          <MessageCircle className="size-5" /> Mandar mensagem
        </a>
      )}
      {a.status === "compareceu" &&
        (a.venda_id ? (
          <Link href={`/app/vendas/${a.venda_id}`} className="block text-center text-sm font-semibold text-royal-vivo underline">
            Ver venda deste atendimento
          </Link>
        ) : (
          <Link href={`/app/vendas/nova?agendamento=${a.id}`} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-royal-vivo font-semibold text-white">
            <ShoppingCart className="size-5" /> Gerar venda do atendimento
          </Link>
        ))}
      <AcoesAtendimento id={a.id} status={a.status} hoje={hojeIso()} jaComecou={a.inicio <= new Date().toISOString()} />
      {msgs && msgs.length > 0 && (
        <Cartao className="p-4 text-sm">
          <h2 className="text-base">Mensagens automáticas</h2>
          <ul className="mt-2 space-y-1">
            {msgs.map((m) => {
              const p = partesSp(m.agendado_para);
              return (
                <li key={m.id} className="flex justify-between text-suave">
                  <span>
                    {formatarData(p.data)} {p.hora}
                  </span>
                  <span className="font-medium">{m.status}</span>
                </li>
              );
            })}
          </ul>
        </Cartao>
      )}
    </div>
  );
}
