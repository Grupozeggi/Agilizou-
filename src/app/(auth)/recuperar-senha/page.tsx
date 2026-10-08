import type { Metadata } from "next";
import { FormRecuperar } from "./form";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function PaginaRecuperar() {
  return <FormRecuperar />;
}
