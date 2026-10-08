import type { Metadata } from "next";
import Link from "next/link";
import { hojeIso } from "@/lib/datas";
import { exigirCliente } from "@/lib/sessao";
import { ListaContas, type Conta } from "./lista";

export const metadata: Metadata = { title: "Contas a pagar e a receber" };

export default async function Contas({ searchParams }: PageProps<"/app/contas">) {
  const p = await searchParams;
  const aba = p.aba === "receber" ? "receber" : "pagar";
  const { supabase } = await exigirCliente();

  const { data, error } = await supabase
    .from("lancamentos")
    .select("id, tipo, valor_centavos, vencimento, descricao, parcela_numero, parcela_total, categoria:categorias(nome)")
    .is("deleted_at", null)
    .eq("status", "pendente")
    .eq("tipo", aba === "pagar" ? "saida" : "entrada")
    .order("vencimento")
    .range(0, 999)
    .returns<Conta[]>();
  if (error) throw new Error("Não foi possível carregar as contas.");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl">Contas</h1>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-white p-1 shadow-suave">
        {(
          [
            ["pagar", "A pagar"],
            ["receber", "A receber"],
          ] as const
        ).map(([valor, rotulo]) => (
          <Link
            key={valor}
            href={`/app/contas?aba=${valor}`}
            aria-current={aba === valor ? "page" : undefined}
            className={`flex h-11 items-center justify-center rounded-lg text-sm font-semibold ${
              aba === valor ? "bg-royal-vivo text-white" : "text-suave"
            }`}
          >
            {rotulo}
          </Link>
        ))}
      </div>
      <ListaContas key={aba} contas={data} aba={aba} hoje={hojeIso()} />
    </div>
  );
}
