import type { Metadata } from "next";
import { FormCadastro } from "./form";

export const metadata: Metadata = { title: "Teste grátis" };

export default function PaginaCadastro() {
  return <FormCadastro />;
}
