"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { CampoDinheiro } from "@/components/campo-dinheiro";
import { Aviso, Botao, Campo, Cartao } from "@/components/ui";
import { formatarQuantidade } from "@/lib/estoque";
import { FORMAS_PAGAMENTO } from "@/lib/lancamentos";
import { excluirProduto, movimentarEstoque } from "../acoes";
import { Formulario } from "@/components/formulario";

type Tipo = "entrada" | "perda" | "ajuste";

export function Movimentar({
  produtoId,
  custoAtual,
  estoqueAtual,
  categoriasSaida,
}: {
  produtoId: string;
  custoAtual: number;
  estoqueAtual: number;
  categoriasSaida: { id: string; nome: string }[];
}) {
  const [tipo, setTipo] = useState<Tipo>("entrada");
  const [lancar, setLancar] = useState(false);
  const [versao, setVersao] = useState(0);
  const [estado, acao, salvando] = useActionState(async (anterior: object, form: FormData) => {
    const r = await movimentarEstoque(anterior, form);
    if (r.sucesso) setVersao((v) => v + 1);
    return r;
  }, {} as Awaited<ReturnType<typeof movimentarEstoque>>);
  const erros = estado.erros ?? {};

  return (
    <Cartao className="p-4">
      <h2 className="text-base">Movimentar estoque</h2>
      <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-cartao p-1">
        {(
          [
            ["entrada", "Entrada"],
            ["perda", "Perda"],
            ["ajuste", "Contagem"],
          ] as const
        ).map(([t, rotulo]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTipo(t)}
            aria-pressed={tipo === t}
            className={`h-10 rounded-lg text-sm font-semibold ${tipo === t ? "bg-white text-tinta shadow-sm" : "text-suave"}`}
          >
            {rotulo}
          </button>
        ))}
      </div>
      <Formulario key={versao} acao={acao} className="mt-4 space-y-4">
        {estado.sucesso && <Aviso tipo="sucesso">{estado.sucesso}</Aviso>}
        {estado.erro && <Aviso>{estado.erro}</Aviso>}
        <input type="hidden" name="produto_id" value={produtoId} />
        <input type="hidden" name="tipo" value={tipo} />
        <Campo
          rotulo={tipo === "ajuste" ? "Quantidade contada" : tipo === "entrada" ? "Quantidade que chegou" : "Quantidade perdida"}
          nome="quantidade"
          inputMode="decimal"
          ajuda={tipo === "ajuste" ? `Hoje o sistema mostra ${formatarQuantidade(estoqueAtual)}. Digite o que você contou.` : undefined}
          erro={erros.quantidade}
        />
        {tipo === "perda" && <Campo rotulo="Motivo (opcional)" nome="observacao" maxLength={200} placeholder="Ex.: venceu, quebrou" />}
        {tipo === "entrada" && (
          <>
            <CampoDinheiro nome="custo" rotulo="Custo de cada unidade" valorInicialCentavos={custoAtual} erro={erros.custo} />
            <label className="flex items-center gap-3 text-sm text-texto">
              <input
                type="checkbox"
                name="lancar_saida"
                checked={lancar}
                onChange={(e) => setLancar(e.target.checked)}
                className="size-5 accent-royal-vivo"
              />
              Lançar esta compra como saída no caixa (paga hoje)
            </label>
            {lancar && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-tinta">Categoria</span>
                  <select name="categoria_id" className="h-12 w-full rounded-xl border border-borda bg-white px-3">
                    {categoriasSaida.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                  {erros.categoria_id && <span className="text-sm text-saida">{erros.categoria_id}</span>}
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-tinta">Pagamento</span>
                  <select name="forma_pagamento" className="h-12 w-full rounded-xl border border-borda bg-white px-3">
                    {Object.entries(FORMAS_PAGAMENTO).map(([v, r]) => (
                      <option key={v} value={v}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </>
        )}
        <Botao type="submit" disabled={salvando}>
          {salvando ? "Salvando..." : "Registrar"}
        </Botao>
      </Formulario>
    </Cartao>
  );
}

export function ExcluirProduto({ id, nome }: { id: string; nome: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [estado, acao, excluindo] = useActionState(excluirProduto, {});
  if (!confirmando) {
    return (
      <button type="button" onClick={() => setConfirmando(true)} className="mx-auto flex h-11 items-center gap-2 text-sm font-semibold text-saida">
        <Trash2 className="size-4" /> Excluir produto
      </button>
    );
  }
  return (
    <Formulario acao={acao} className="space-y-3 rounded-xl border border-saida/30 bg-saida/5 p-4">
      <input type="hidden" name="id" value={id} />
      <p className="font-semibold text-tinta">Excluir “{nome}”?</p>
      <p className="text-sm text-suave">As vendas antigas continuam no histórico.</p>
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      <div className="flex gap-2">
        <Botao type="button" variante="secundario" onClick={() => setConfirmando(false)}>
          Cancelar
        </Botao>
        <Botao type="submit" variante="perigo" disabled={excluindo}>
          {excluindo ? "Excluindo..." : "Excluir"}
        </Botao>
      </div>
    </Formulario>
  );
}
