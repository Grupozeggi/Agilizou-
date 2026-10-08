import type { Metadata } from "next";
import { FormRedefinir } from "./form";

export const metadata: Metadata = { title: "Nova senha" };

export default function PaginaRedefinir() {
  return <FormRedefinir />;
}
