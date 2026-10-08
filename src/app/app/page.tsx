import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Sparkles } from "lucide-react";
import { Cartao } from "@/components/ui";
import { diasEntre, formatarData, hojeIso } from "@/lib/datas";
import { exigirCliente } from "@/lib/sessao";

export const metadata: Metadata = { title: "Início" };

export default async function Inicio() {
  const { empresa } = await exigirCliente();
  const fimTeste = empresa.teste_ate.slice(0, 10);
  const diasRestantes = Math.max(0, diasEntre(hojeIso(), fimTeste));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl">Olá! Este é o caixa da {empresa.nome}.</h1>

      {empresa.status_assinatura === "teste" && (
        <Cartao className="flex items-start gap-3">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-dourado" strokeWidth={1.75} />
          <p className="text-sm text-texto">
            Você está no teste grátis.{" "}
            <strong className="text-tinta">
              {diasRestantes === 1 ? "Falta 1 dia" : `Faltam ${diasRestantes} dias`}
            </strong>{" "}
            (até {formatarData(fimTeste)}).
          </p>
        </Cartao>
      )}

      <Cartao>
        <p className="text-suave">
          Em breve aqui: saldo atual, entradas e saídas do mês, lucro e contas vencendo.
        </p>
      </Cartao>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/app/lancamentos/novo?tipo=entrada"
          className="flex h-14 items-center justify-center gap-2 rounded-cartao bg-white font-semibold text-entrada shadow-suave"
        >
          <ArrowDownLeft className="size-5" strokeWidth={2} /> Entrada
        </Link>
        <Link
          href="/app/lancamentos/novo?tipo=saida"
          className="flex h-14 items-center justify-center gap-2 rounded-cartao bg-white font-semibold text-saida shadow-suave"
        >
          <ArrowUpRight className="size-5" strokeWidth={2} /> Saída
        </Link>
      </div>
    </div>
  );
}
