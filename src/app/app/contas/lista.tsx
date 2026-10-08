"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Undo2 } from "lucide-react";
import { Aviso, Cartao } from "@/components/ui";
import { formatarData } from "@/lib/datas";
import { formatarReais, somar } from "@/lib/dinheiro";
import { situacaoConta, textoVencimento, type SituacaoConta } from "@/lib/lancamentos";
import { desfazerPagamento, marcarComoPago } from "../lancamentos/acoes";

export type Conta = {
  id: string;
  tipo: "entrada" | "saida";
  valor_centavos: number;
  vencimento: string;
  descricao: string | null;
  parcela_numero: number | null;
  parcela_total: number | null;
  categoria: { nome: string } | null;
};

const SEM_CONEXAO = "Não foi possível salvar. Confira sua internet e tente de novo.";

const GRUPOS: { id: SituacaoConta; titulo: string; estilo: string }[] = [
  { id: "vencida", titulo: "Vencidas", estilo: "text-saida" },
  { id: "hoje", titulo: "Vencem hoje", estilo: "text-saida" },
  { id: "proximos7", titulo: "Próximos 7 dias", estilo: "text-dourado" },
  { id: "depois", titulo: "Mais para frente", estilo: "text-suave" },
];

export function ListaContas({ contas, aba, hoje }: { contas: Conta[]; aba: "pagar" | "receber"; hoje: string }) {
  // Some da lista na hora do toque; volta se der erro ou se desfizer.
  const [pagas, setPagas] = useState<Set<string>>(new Set());
  const [ultima, setUltima] = useState<Conta | null>(null);
  const [erro, setErro] = useState<string>();
  const [, iniciar] = useTransition();

  const visiveis = contas.filter((c) => !pagas.has(c.id));
  const verbo = aba === "pagar" ? "Pagar" : "Recebi";

  function pagar(conta: Conta) {
    setErro(undefined);
    setPagas((s) => new Set(s).add(conta.id));
    setUltima(conta);
    iniciar(async () => {
      const r = await marcarComoPago(conta.id).catch(() => ({ erro: SEM_CONEXAO }));
      if (r.erro) {
        setErro(r.erro);
        setUltima(null);
        setPagas((s) => {
          const n = new Set(s);
          n.delete(conta.id);
          return n;
        });
      }
    });
  }

  function desfazer(conta: Conta) {
    setUltima(null);
    iniciar(async () => {
      const r = await desfazerPagamento(conta.id).catch(() => ({ erro: SEM_CONEXAO }));
      if (r.erro) setErro(r.erro);
      else
        setPagas((s) => {
          const n = new Set(s);
          n.delete(conta.id);
          return n;
        });
    });
  }

  if (visiveis.length === 0 && !ultima) {
    return (
      <Cartao className="text-center text-suave">
        {aba === "pagar" ? "Nenhuma conta a pagar." : "Nada a receber no momento."}{" "}
        <Link href={`/app/lancamentos/novo?tipo=${aba === "pagar" ? "saida" : "entrada"}`} className="font-semibold text-royal-vivo underline">
          Lançar conta
        </Link>
      </Cartao>
    );
  }

  return (
    <div className="space-y-4">
      {erro && <Aviso>{erro}</Aviso>}
      {ultima && (
        <div className="flex items-center justify-between rounded-xl bg-royal-escuro px-4 py-3 text-sm text-white" role="status">
          <span>
            {aba === "pagar" ? "Paga" : "Recebida"}: {ultima.descricao || ultima.categoria?.nome}
          </span>
          <button type="button" onClick={() => desfazer(ultima)} className="flex items-center gap-1 font-semibold text-dourado">
            <Undo2 className="size-4" /> Desfazer
          </button>
        </div>
      )}

      {GRUPOS.map((g) => {
        const itens = visiveis.filter((c) => situacaoConta(c.vencimento, hoje) === g.id);
        if (!itens.length) return null;
        return (
          <section key={g.id}>
            <div className="mb-2 flex items-baseline justify-between px-1">
              <h2 className={`text-sm font-semibold ${g.estilo}`}>
                {g.titulo} ({itens.length})
              </h2>
              <span className="numero text-sm font-semibold text-tinta">{formatarReais(somar(itens.map((c) => c.valor_centavos)))}</span>
            </div>
            <ul
              className={`divide-y divide-borda overflow-hidden rounded-cartao bg-white shadow-suave ${
                g.id === "vencida" || g.id === "hoje" ? "ring-1 ring-saida/30" : g.id === "proximos7" ? "ring-1 ring-dourado/40" : ""
              }`}
            >
              {itens.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-3 pl-4 pr-3">
                  <Link href={`/app/lancamentos/${c.id}`} className="min-w-0 flex-1 py-1">
                    <span className="block truncate font-medium text-tinta">
                      {c.descricao || c.categoria?.nome || "Sem descrição"}
                      {c.parcela_total ? <span className="font-normal text-suave"> · {c.parcela_numero}/{c.parcela_total}</span> : null}
                    </span>
                    <span className={`block text-sm ${g.id === "vencida" || g.id === "hoje" ? "text-saida" : "text-suave"}`}>
                      {formatarData(c.vencimento)} · {textoVencimento(c.vencimento, hoje)}
                    </span>
                  </Link>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`numero font-semibold ${c.tipo === "entrada" ? "text-entrada" : "text-saida"}`}>
                      {formatarReais(c.valor_centavos)}
                    </span>
                    <button
                      type="button"
                      onClick={() => pagar(c)}
                      className="flex h-10 items-center gap-1 rounded-xl bg-royal-claro px-3 text-sm font-semibold text-royal hover:bg-royal-vivo hover:text-white"
                      aria-label={`${verbo}: ${c.descricao || c.categoria?.nome}`}
                    >
                      <Check className="size-4" strokeWidth={2} /> {verbo}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
