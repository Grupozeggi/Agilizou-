import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { exigirCliente } from "@/lib/sessao";
import { Assistente } from "./assistente";

export const metadata: Metadata = { title: "Boas-vindas" };

export default async function BoasVindas() {
  const { empresa } = await exigirCliente();
  if (empresa.onboarding_concluido) redirect("/app");

  return (
    <main className="flex min-h-dvh flex-col items-center bg-cartao px-4 py-8">
      <Logo className="mb-6 text-2xl" />
      <div className="w-full max-w-md">
        <Assistente nomeInicial={empresa.nome === "Minha empresa" ? "" : empresa.nome} />
      </div>
    </main>
  );
}
