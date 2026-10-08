import type { Metadata } from "next";
import { FormEntrar } from "./form";

export const metadata: Metadata = { title: "Entrar" };

export default async function PaginaEntrar({ searchParams }: PageProps<"/entrar">) {
  const p = await searchParams;
  const proximo = typeof p.proximo === "string" ? p.proximo : undefined;
  const erroLink = p.erro === "link";
  return <FormEntrar proximo={proximo} erroLink={erroLink} />;
}
