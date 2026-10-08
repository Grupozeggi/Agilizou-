import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Cartao } from "@/components/ui";

export const metadata: Metadata = { title: "Acesso negado" };

export default function AcessoNegado() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-cartao px-4">
      <Cartao className="max-w-md text-center">
        <ShieldAlert className="mx-auto size-10 text-saida" strokeWidth={1.5} />
        <h1 className="mt-4 text-2xl">Acesso negado</h1>
        <p className="mt-2 text-suave">
          Você não tem permissão para abrir esta página. A tentativa foi registrada.
        </p>
        <Link href="/app" className="mt-6 inline-block font-semibold text-royal-vivo hover:underline">
          Voltar para o início
        </Link>
      </Cartao>
    </main>
  );
}
