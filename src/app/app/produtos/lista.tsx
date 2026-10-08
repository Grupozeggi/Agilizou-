"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { LeitorCodigo } from "@/components/leitor-codigo";
import { Aviso, Cartao } from "@/components/ui";
import { formatarReais } from "@/lib/dinheiro";
import { estoqueBaixo, formatarQuantidade, margemProduto } from "@/lib/estoque";

type Produto = {
  id: string;
  codigo: number;
  codigo_barras: string;
  nome: string;
  unidade: string;
  custo_centavos: number;
  preco_centavos: number;
  estoque: number;
  estoque_minimo: number;
};

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function ListaProdutos({ produtos, soBaixo }: { produtos: Produto[]; soBaixo: boolean }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [naoAchou, setNaoAchou] = useState<string>();
  const baixos = produtos.filter((p) => estoqueBaixo(p.estoque, p.estoque_minimo));

  const termo = semAcento(busca.trim());
  const visiveis = (soBaixo ? baixos : produtos).filter(
    (p) => !termo || semAcento(p.nome).includes(termo) || p.codigo_barras.includes(termo) || String(p.codigo) === termo,
  );

  return (
    <div className="space-y-4">
      <LeitorCodigo
        placeholder="Buscar por nome ou bipar código"
        onTexto={(t) => {
          setBusca(t);
          setNaoAchou(undefined);
        }}
        onCodigo={(codigo) => {
          // Bipou: abre o produto direto.
          const achado = produtos.find((p) => p.codigo_barras === codigo || String(p.codigo) === codigo);
          if (achado) router.push(`/app/produtos/${achado.id}`);
          else setNaoAchou(codigo);
        }}
      />
      {naoAchou && (
        <Aviso tipo="info">
          Nenhum produto com o código {naoAchou}.{" "}
          <Link href={`/app/produtos/novo?codigo=${encodeURIComponent(naoAchou)}`} className="font-semibold underline">
            Cadastrar com este código
          </Link>
        </Aviso>
      )}

      <div className="flex gap-2 text-sm">
        <Link
          href="/app/produtos"
          className={`rounded-full border px-4 py-2 font-medium ${!soBaixo ? "border-royal-vivo bg-royal-claro text-royal" : "border-borda text-suave"}`}
        >
          Todos ({produtos.length})
        </Link>
        <Link
          href="/app/produtos?filtro=baixo"
          className={`flex items-center gap-1 rounded-full border px-4 py-2 font-medium ${soBaixo ? "border-saida bg-saida/5 text-saida" : "border-borda text-suave"}`}
        >
          <AlertTriangle className="size-3.5" /> Estoque baixo ({baixos.length})
        </Link>
      </div>

      {visiveis.length === 0 ? (
        <Cartao className="text-center text-suave">
          {produtos.length === 0 ? (
            <>
              Nenhum produto ainda.{" "}
              <Link href="/app/produtos/novo" className="font-semibold text-royal-vivo underline">
                Cadastrar o primeiro
              </Link>
            </>
          ) : (
            "Nada encontrado."
          )}
        </Cartao>
      ) : (
        <ul className="divide-y divide-borda overflow-hidden rounded-cartao bg-white shadow-suave">
          {visiveis.map((p) => {
            const baixo = estoqueBaixo(p.estoque, p.estoque_minimo);
            const m = margemProduto(p.preco_centavos, p.custo_centavos);
            return (
              <li key={p.id}>
                <Link href={`/app/produtos/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-cartao">
                  <span className="numero w-12 shrink-0 text-xs text-suave">#{String(p.codigo).padStart(4, "0")}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-tinta">{p.nome}</span>
                    <span className="block text-sm text-suave">
                      {formatarReais(p.preco_centavos)}
                      {m.percentual !== null && ` · margem ${m.percentual.toLocaleString("pt-BR")}%`}
                    </span>
                  </span>
                  <span className={`numero text-right text-sm font-semibold ${baixo ? "text-saida" : "text-tinta"}`}>
                    {baixo && <AlertTriangle className="mr-1 inline size-3.5" />}
                    {formatarQuantidade(p.estoque, p.unidade)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
