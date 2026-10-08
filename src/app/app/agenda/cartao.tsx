"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, ShoppingCart, UserX } from "lucide-react";
import { partesSp, STATUS_AGENDA, type StatusAgenda } from "@/lib/agenda";
import { formatarReais } from "@/lib/dinheiro";
import type { Atendimento } from "./dados";
import { mudarStatus } from "./acoes";

const COR: Record<StatusAgenda, string> = {
  agendado: "bg-royal-claro text-royal",
  confirmado: "bg-entrada/10 text-entrada",
  compareceu: "bg-entrada/10 text-entrada",
  faltou: "bg-saida/10 text-saida",
  cancelado: "bg-cartao text-suave line-through",
  remarcado: "bg-cartao text-suave",
};

/** Cartão do atendimento com presença em um toque ("Veio" / "Faltou"). */
export function CartaoAtendimento({ a, agoraIso, compacto }: { a: Atendimento; agoraIso: string; compacto?: boolean }) {
  const [status, setStatus] = useState(a.status);
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();
  const { hora } = partesSp(a.inicio);
  const fim = partesSp(a.fim).hora;
  const aberto = status === "agendado" || status === "confirmado";
  const jaComecou = a.inicio <= agoraIso;

  function marcar(novo: StatusAgenda) {
    const anterior = status;
    setStatus(novo);
    setErro(undefined);
    iniciar(async () => {
      const r = await mudarStatus(a.id, novo as "compareceu").catch(() => ({ erro: "Sem conexão. Tente de novo." }));
      if (r.erro) {
        setStatus(anterior);
        setErro(r.erro);
      }
    });
  }

  return (
    <li className={`rounded-cartao bg-white p-3 shadow-suave ${status === "cancelado" || status === "remarcado" ? "opacity-60" : ""}`}>
      <Link href={`/app/agenda/${a.id}`} className="flex items-start gap-3">
        <span className="numero w-12 shrink-0 pt-0.5 text-sm font-semibold text-royal">
          {hora}
          {!compacto && <span className="block text-xs font-normal text-suave">{fim}</span>}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-tinta">{a.cliente?.nome}</span>
          <span className="block truncate text-xs text-suave">
            {[a.servico?.nome, compacto ? a.profissional?.nome : null, a.servico ? formatarReais(a.servico.preco_centavos) : null, a.origem === "link" ? "pelo link" : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${COR[status]}`}>{STATUS_AGENDA[status]}</span>
      </Link>
      {aberto && !compacto && (
        <div className="mt-2 flex gap-2 pl-15">
          {jaComecou ? (
            <>
              <button type="button" disabled={pendente} onClick={() => marcar("compareceu")} className="flex h-10 flex-1 items-center justify-center gap-1 rounded-xl bg-entrada/10 text-sm font-semibold text-entrada">
                <Check className="size-4" /> Veio
              </button>
              <button type="button" disabled={pendente} onClick={() => marcar("faltou")} className="flex h-10 flex-1 items-center justify-center gap-1 rounded-xl bg-saida/10 text-sm font-semibold text-saida">
                <UserX className="size-4" /> Faltou
              </button>
            </>
          ) : (
            status === "agendado" && (
              <button type="button" disabled={pendente} onClick={() => marcar("confirmado")} className="flex h-10 flex-1 items-center justify-center gap-1 rounded-xl bg-royal-claro text-sm font-semibold text-royal">
                <Check className="size-4" /> Confirmar
              </button>
            )
          )}
        </div>
      )}
      {status === "compareceu" && !a.venda_id && !compacto && (
        <Link
          href={`/app/vendas/nova?agendamento=${a.id}`}
          className="mt-2 flex h-10 items-center justify-center gap-1.5 rounded-xl bg-royal-vivo text-sm font-semibold text-white"
        >
          <ShoppingCart className="size-4" /> Gerar venda do atendimento
        </Link>
      )}
      {erro && <p className="mt-2 text-sm text-saida">{erro}</p>}
    </li>
  );
}
