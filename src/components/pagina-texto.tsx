import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

export function PaginaTexto({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link href="/">
        <Logo />
      </Link>
      <h1 className="mt-8 text-3xl">{titulo}</h1>
      <div className="mt-6 space-y-4 leading-relaxed text-texto [&_h2]:mt-8 [&_h2]:text-xl">{children}</div>
    </div>
  );
}
