import Link from "next/link";

export default function NaoEncontrado() {
  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl">Página não encontrada</h1>
      <p className="mt-2 text-suave">O endereço pode estar errado ou o item foi excluído.</p>
      <Link href="/app" className="mt-6 font-semibold text-royal-vivo hover:underline">
        Voltar para o início
      </Link>
    </main>
  );
}
