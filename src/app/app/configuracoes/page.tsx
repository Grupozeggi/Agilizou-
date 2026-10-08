import type { Metadata } from "next";
import Link from "next/link";
import { BellRing, ChevronRight, CreditCard, LogOut, Tags } from "lucide-react";
import { sair } from "@/app/(auth)/acoes";
import { exigirCliente } from "@/lib/sessao";

export const metadata: Metadata = { title: "Ajustes" };

export default async function Configuracoes() {
  const { empresa, claims } = await exigirCliente();
  const itens = [
    { href: "/app/configuracoes/categorias", rotulo: "Categorias", icone: Tags },
    { href: "/app/configuracoes/avisos", rotulo: "Avisos de vencimento", icone: BellRing },
    { href: "/app/assinatura", rotulo: "Assinatura", icone: CreditCard },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl">Ajustes</h1>
      <div className="rounded-cartao bg-white p-5 shadow-suave">
        <p className="font-semibold text-tinta">{empresa.nome}</p>
        <p className="text-sm text-suave">{claims.email}</p>
      </div>
      <ul className="divide-y divide-borda overflow-hidden rounded-cartao bg-white shadow-suave">
        {itens.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="flex min-h-14 items-center gap-3 px-5 hover:bg-cartao">
              <i.icone className="size-5 text-royal" strokeWidth={1.75} />
              <span className="flex-1 font-medium text-tinta">{i.rotulo}</span>
              <ChevronRight className="size-5 text-suave" />
            </Link>
          </li>
        ))}
        <li>
          <form action={sair}>
            <button type="submit" className="flex min-h-14 w-full items-center gap-3 px-5 text-left hover:bg-cartao">
              <LogOut className="size-5 text-saida" strokeWidth={1.75} />
              <span className="flex-1 font-medium text-saida">Sair</span>
            </button>
          </form>
        </li>
      </ul>
    </div>
  );
}
