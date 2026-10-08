import type { Metadata } from "next";
import { Verificacao2fa } from "./verificacao";

export const metadata: Metadata = { title: "Verificação em duas etapas" };

export default function PaginaVerificacao() {
  return (
    <div className="mx-auto max-w-md">
      <Verificacao2fa />
    </div>
  );
}
