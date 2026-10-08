import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Sparkles, Tags } from "lucide-react";
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

      <Link href="/app/configuracoes/categorias" className="block">
        <Cartao className="flex items-center gap-3 hover:bg-cartao">
          <Tags className="size-5 text-royal" strokeWidth={1.75} />
          <span className="flex-1 font-medium text-tinta">Categorias de entradas e saídas</span>
          <ChevronRight className="size-5 text-suave" strokeWidth={1.75} />
        </Cartao>
      </Link>
    </div>
  );
}
