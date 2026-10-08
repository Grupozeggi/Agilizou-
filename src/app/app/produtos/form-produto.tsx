"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CampoDinheiro } from "@/components/campo-dinheiro";
import { LeitorCodigo } from "@/components/leitor-codigo";
import { Aviso, Botao, Campo } from "@/components/ui";
import { formatarReais } from "@/lib/dinheiro";
import { margemProduto, UNIDADES } from "@/lib/estoque";
import { salvarProduto } from "./acoes";
import { Formulario } from "@/components/formulario";

type Inicial = {
  id?: string;
  nome?: string;
  unidade?: string;
  custo_centavos?: number;
  preco_centavos?: number;
  estoque_minimo?: number;
  codigo_barras?: string;
  codigo_interno?: boolean;
};

export function FormProduto({ inicial = {}, avisoLimite }: { inicial?: Inicial; avisoLimite?: string }) {
  const [estado, acao, salvando] = useActionState(salvarProduto, {});
  const [custo, setCusto] = useState(inicial.custo_centavos ?? 0);
  const [preco, setPreco] = useState(inicial.preco_centavos ?? 0);
  // Código gerado pelo sistema não aparece no campo (fica vazio = "automático").
  const [codigo, setCodigo] = useState(inicial.codigo_interno ? "" : (inicial.codigo_barras ?? ""));
  const m = margemProduto(preco, custo);
  const erros = estado.erros ?? {};

  return (
    <Formulario acao={acao} className="space-y-5">
      {avisoLimite && !estado.erro && <Aviso tipo="info">{avisoLimite}</Aviso>}
      {estado.erro && (
        <Aviso>
          {estado.erro}
          {estado.limiteAtingido && (
            <Link href="/app/assinatura" className="mt-2 block font-semibold underline">
              Fazer upgrade
            </Link>
          )}
        </Aviso>
      )}
      {inicial.id && <input type="hidden" name="id" value={inicial.id} />}
      <Campo rotulo="Nome do produto" nome="nome" defaultValue={inicial.nome} maxLength={120} erro={erros.nome} autoFocus={!inicial.id} />

      <div className="grid grid-cols-2 gap-3">
        <CampoDinheiro
          nome="custo"
          rotulo="Custo (quanto paga)"
          valorInicialCentavos={inicial.custo_centavos}
          erro={erros.custo}
          onValor={setCusto}
        />
        <CampoDinheiro
          nome="preco"
          rotulo="Preço de venda"
          valorInicialCentavos={inicial.preco_centavos}
          erro={erros.preco}
          onValor={setPreco}
        />
      </div>
      <p className={`-mt-2 text-sm ${m.valor < 0 ? "text-saida" : "text-suave"}`}>
        {preco > 0
          ? `Você ganha ${formatarReais(m.valor)} por unidade${m.percentual !== null ? ` (${m.percentual.toLocaleString("pt-BR")}% do preço)` : ""}.`
          : "Digite o preço para ver quanto você ganha por unidade."}
      </p>

      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-tinta">Unidade</span>
          <select
            name="unidade"
            defaultValue={inicial.unidade ?? "un"}
            className="h-12 w-full rounded-xl border border-borda bg-white px-3 text-base"
          >
            {UNIDADES.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
        {!inicial.id && (
          <Campo rotulo="Estoque atual" nome="estoque" inputMode="decimal" defaultValue="0" erro={erros.estoque} />
        )}
        <Campo
          rotulo="Estoque mínimo"
          nome="estoque_minimo"
          inputMode="decimal"
          defaultValue={String(inicial.estoque_minimo ?? 0).replace(".", ",")}
          erro={erros.estoque_minimo}
        />
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-tinta">Código de barras</span>
        <LeitorCodigo placeholder="Bipe o código da embalagem" onCodigo={setCodigo} />
        <input type="hidden" name="codigo_barras" value={codigo} />
        <p className={`mt-1 text-sm ${erros.codigo_barras ? "text-saida" : "text-suave"}`}>
          {erros.codigo_barras ??
            (codigo ? (
              <>
                Usando o código <strong className="numero text-tinta">{codigo}</strong>.{" "}
                <button type="button" className="font-semibold text-royal-vivo underline" onClick={() => setCodigo("")}>
                  Gerar automático
                </button>
              </>
            ) : (
              "Sem código na embalagem? Deixe em branco: o Agilizou gera um para imprimir na etiqueta."
            ))}
        </p>
      </div>

      <Botao type="submit" disabled={salvando}>
        {salvando ? "Salvando..." : inicial.id ? "Salvar alterações" : "Cadastrar produto"}
      </Botao>
    </Formulario>
  );
}

