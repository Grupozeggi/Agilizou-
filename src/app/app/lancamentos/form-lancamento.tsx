"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ChevronDown, Repeat, Trash2 } from "lucide-react";
import { CampoDinheiro } from "@/components/campo-dinheiro";
import { Aviso, Botao, Campo } from "@/components/ui";
import type { EstadoForm } from "@/lib/formulario";
import { FORMAS_PAGAMENTO } from "@/lib/lancamentos";
import { criarLancamento, editarLancamento, excluirLancamento } from "./acoes";
import { Formulario } from "@/components/formulario";

export type CategoriaOpcao = { id: string; nome: string; tipo: "entrada" | "saida" };

export type LancamentoEditavel = {
  id: string;
  tipo: "entrada" | "saida";
  valor_centavos: number;
  categoria_id: string | null;
  data: string;
  status: "pago" | "pendente";
  forma_pagamento: string | null;
  descricao: string | null;
  observacao: string | null;
  grupo_id: string | null;
  parcela_numero: number | null;
  parcela_total: number | null;
  recorrente: boolean;
  cliente_id?: string | null;
};

export type ClienteOpcao = { id: string; nome: string };

/**
 * Lançar em 3 toques: digitar o valor, tocar na categoria, tocar em Salvar.
 * Data (hoje), "já foi pago" (sim) e o resto já vêm preenchidos.
 */
export function FormLancamento({
  categorias,
  hoje,
  tipoInicial = "entrada",
  lancamento,
  avisoLimite,
  clientes = [],
}: {
  clientes?: ClienteOpcao[];
  categorias: CategoriaOpcao[];
  hoje: string;
  tipoInicial?: "entrada" | "saida";
  lancamento?: LancamentoEditavel;
  avisoLimite?: string;
}) {
  const editando = Boolean(lancamento);
  // A cada lançamento salvo, a "versão" muda e o formulário volta limpo.
  const [versao, setVersao] = useState(0);
  const [estado, acao, salvando] = useActionState(async (anterior: EstadoForm, form: FormData) => {
    let r: EstadoForm;
    try {
      r = await (editando ? editarLancamento : criarLancamento)(anterior, form);
    } catch (e) {
      // Sem internet: mantém o que foi digitado e avisa. Outros erros
      // (incluindo o redirecionamento após editar) seguem o fluxo normal.
      if (e instanceof TypeError) return { erro: "Sem conexão com a internet. Confira e toque em Salvar de novo." };
      throw e;
    }
    if (r.sucesso) setVersao((v) => v + 1);
    return r;
  }, {});

  return (
    <div className="space-y-4">
      {estado.sucesso && (
        <Aviso tipo="sucesso">
          {estado.sucesso}{" "}
          <Link href="/app/lancamentos" className="font-semibold underline">
            Ver lançamentos
          </Link>
        </Aviso>
      )}
      {(estado.aviso || (!estado.sucesso && avisoLimite)) && <Aviso tipo="info">{estado.aviso ?? avisoLimite}</Aviso>}
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
      <Campos
        key={versao}
        acao={acao}
        salvando={salvando}
        estado={estado}
        categorias={categorias}
        hoje={hoje}
        tipoInicial={lancamento?.tipo ?? tipoInicial}
        lancamento={lancamento}
        clientes={clientes}
      />
      {lancamento && <Excluir lancamento={lancamento} />}
    </div>
  );
}

function Campos({
  acao,
  salvando,
  estado,
  categorias,
  hoje,
  tipoInicial,
  lancamento,
  clientes,
}: {
  clientes: ClienteOpcao[];
  acao: (f: FormData) => void;
  salvando: boolean;
  estado: EstadoForm;
  categorias: CategoriaOpcao[];
  hoje: string;
  tipoInicial: "entrada" | "saida";
  lancamento?: LancamentoEditavel;
}) {
  const [tipo, setTipo] = useState(tipoInicial);
  const [categoria, setCategoria] = useState(lancamento?.categoria_id ?? "");
  const [pago, setPago] = useState(lancamento ? lancamento.status === "pago" : true);
  const [repeticao, setRepeticao] = useState<"nao" | "recorrente" | "parcelado">("nao");
  const erros = estado.erros ?? {};
  const temErroEscondido = ["forma_pagamento", "descricao", "observacao", "vezes"].some((c) => erros[c]);
  const [maisOpcoes, setMaisOpcoes] = useState(Boolean(lancamento?.descricao || lancamento?.observacao));
  const opcoes = categorias.filter((c) => c.tipo === tipo);
  const ehEntrada = tipo === "entrada";

  return (
    <Formulario acao={acao} className="space-y-5">
      {lancamento && <input type="hidden" name="id" value={lancamento.id} />}
      <input type="hidden" name="tipo" value={tipo} />

      {!lancamento && (
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-cartao p-1" role="radiogroup" aria-label="Tipo">
          {(["entrada", "saida"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tipo === t}
              onClick={() => {
                setTipo(t);
                setCategoria("");
              }}
              className={`h-11 rounded-lg text-sm font-semibold transition-colors ${
                tipo === t ? (t === "entrada" ? "bg-white text-entrada shadow-sm" : "bg-white text-saida shadow-sm") : "text-suave"
              }`}
            >
              {t === "entrada" ? "Entrada" : "Saída"}
            </button>
          ))}
        </div>
      )}

      <CampoDinheiro
        nome="valor"
        rotulo={ehEntrada ? "Quanto entrou?" : "Quanto saiu?"}
        valorInicialCentavos={lancamento?.valor_centavos}
        erro={erros.valor}
        autoFocus={!lancamento}
      />

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-tinta">Categoria</legend>
        {opcoes.length === 0 ? (
          <p className="text-sm text-suave">
            Nenhuma categoria de {ehEntrada ? "entrada" : "saída"}.{" "}
            <Link href="/app/configuracoes/categorias" className="font-semibold text-royal-vivo underline">
              Criar categoria
            </Link>
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {opcoes.map((c) => (
              <label
                key={c.id}
                className={`flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm font-medium transition-colors ${
                  categoria === c.id ? "border-royal-vivo bg-royal-claro text-royal" : "border-borda text-texto hover:bg-cartao"
                }`}
              >
                <input
                  type="radio"
                  name="categoria_id"
                  value={c.id}
                  checked={categoria === c.id}
                  onChange={() => setCategoria(c.id)}
                  className="sr-only"
                />
                {c.nome}
              </label>
            ))}
          </div>
        )}
        {erros.categoria_id && <p className="mt-1 text-sm text-saida">{erros.categoria_id}</p>}
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="mb-1.5 block text-sm font-medium text-tinta">Situação</span>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-cartao p-1">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setPago(v)}
                aria-pressed={pago === v}
                className={`h-10 rounded-lg text-xs font-semibold ${pago === v ? "bg-white text-tinta shadow-sm" : "text-suave"}`}
              >
                {v ? (ehEntrada ? "Recebido" : "Pago") : "Pendente"}
              </button>
            ))}
          </div>
          {pago && <input type="hidden" name="pago" value="on" />}
        </div>
        <Campo
          rotulo={pago ? "Data" : "Vencimento"}
          nome="data"
          type="date"
          defaultValue={lancamento?.data ?? hoje}
          erro={erros.data}
          required
        />
      </div>

      <button
        type="button"
        onClick={() => setMaisOpcoes(!maisOpcoes)}
        className="flex items-center gap-1 text-sm font-semibold text-royal-vivo"
        aria-expanded={maisOpcoes || temErroEscondido}
      >
        Mais opções
        <ChevronDown className={`size-4 transition-transform ${maisOpcoes || temErroEscondido ? "rotate-180" : ""}`} />
      </button>

      <div hidden={!(maisOpcoes || temErroEscondido)} className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-tinta">Forma de pagamento</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(FORMAS_PAGAMENTO).map(([valor, rotulo]) => (
              <label
                key={valor}
                className="flex min-h-10 cursor-pointer items-center rounded-full border border-borda px-3 text-sm text-texto has-checked:border-royal-vivo has-checked:bg-royal-claro has-checked:text-royal"
              >
                <input
                  type="radio"
                  name="forma_pagamento"
                  value={valor}
                  defaultChecked={lancamento?.forma_pagamento === valor}
                  className="sr-only"
                />
                {rotulo}
              </label>
            ))}
          </div>
          {erros.forma_pagamento && <p className="mt-1 text-sm text-saida">{erros.forma_pagamento}</p>}
        </fieldset>

        {clientes.length > 0 && (
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-tinta">{ehEntrada ? "Cliente (opcional)" : "Cliente/fornecedor (opcional)"}</span>
            <select
              name="cliente_id"
              defaultValue={lancamento?.cliente_id ?? ""}
              className="h-12 w-full rounded-xl border border-borda bg-white px-3 text-base"
            >
              <option value="">—</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        <Campo
          rotulo="Descrição (opcional)"
          nome="descricao"
          maxLength={140}
          placeholder={ehEntrada ? "Ex.: Revisão do Gol do Carlos" : "Ex.: Aluguel de outubro"}
          defaultValue={lancamento?.descricao ?? ""}
          erro={erros.descricao}
        />
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-tinta">Observação (opcional)</span>
          <textarea
            name="observacao"
            maxLength={500}
            rows={2}
            defaultValue={lancamento?.observacao ?? ""}
            className="w-full rounded-xl border border-borda px-4 py-3 text-base outline-none focus:border-royal-vivo focus:ring-2 focus:ring-royal-vivo/20"
          />
          {erros.observacao && <span className="mt-1 block text-sm text-saida">{erros.observacao}</span>}
        </label>

        {!lancamento && (
          <fieldset>
            <legend className="mb-2 flex items-center gap-1.5 text-sm font-medium text-tinta">
              <Repeat className="size-4 text-dourado" strokeWidth={1.75} /> Repetir
            </legend>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-cartao p-1">
              {(
                [
                  ["nao", "Não"],
                  ["recorrente", "Todo mês"],
                  ["parcelado", "Parcelar"],
                ] as const
              ).map(([valor, rotulo]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setRepeticao(valor)}
                  aria-pressed={repeticao === valor}
                  className={`h-10 rounded-lg text-sm font-semibold ${repeticao === valor ? "bg-white text-tinta shadow-sm" : "text-suave"}`}
                >
                  {rotulo}
                </button>
              ))}
            </div>
            <input type="hidden" name="repeticao" value={repeticao} />
            {repeticao !== "nao" && (
              <div className="mt-3">
                <Campo
                  rotulo={repeticao === "parcelado" ? "Em quantas parcelas?" : "Por quantos meses?"}
                  nome="vezes"
                  type="number"
                  inputMode="numeric"
                  min={2}
                  max={repeticao === "parcelado" ? 48 : 60}
                  defaultValue={repeticao === "parcelado" ? 3 : 12}
                  ajuda={
                    repeticao === "parcelado"
                      ? "O valor digitado é o total; dividimos em parcelas mensais."
                      : "O mesmo valor é lançado todo mês, como pendente."
                  }
                  erro={erros.vezes}
                />
              </div>
            )}
          </fieldset>
        )}
      </div>

      {lancamento?.grupo_id && <EscopoSerie lancamento={lancamento} acao="alterar" />}

      <Botao type="submit" disabled={salvando}>
        {salvando ? "Salvando..." : lancamento ? "Salvar alterações" : "Salvar"}
      </Botao>
    </Formulario>
  );
}

function EscopoSerie({ lancamento, acao }: { lancamento: LancamentoEditavel; acao: string }) {
  const nome = lancamento.recorrente ? "repetições" : "parcelas";
  return (
    <fieldset className="rounded-xl border border-borda p-3">
      <legend className="px-1 text-sm font-medium text-tinta">
        {lancamento.recorrente ? "Lançamento mensal" : `Parcela ${lancamento.parcela_numero} de ${lancamento.parcela_total}`}
      </legend>
      {(
        [
          ["este", `${acao[0].toUpperCase() + acao.slice(1)} só este`],
          ["proximos", `${acao[0].toUpperCase() + acao.slice(1)} este e as próximas ${nome}`],
        ] as const
      ).map(([valor, rotulo]) => (
        <label key={valor} className="flex min-h-10 items-center gap-3 text-sm text-texto">
          <input type="radio" name="escopo" value={valor} defaultChecked={valor === "este"} className="size-5 accent-royal-vivo" />
          {rotulo}
        </label>
      ))}
    </fieldset>
  );
}

function Excluir({ lancamento }: { lancamento: LancamentoEditavel }) {
  const [confirmando, setConfirmando] = useState(false);
  const [estado, acao, excluindo] = useActionState(excluirLancamento, {});

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="mx-auto flex h-11 items-center gap-2 text-sm font-semibold text-saida"
      >
        <Trash2 className="size-4" strokeWidth={1.75} /> Excluir lançamento
      </button>
    );
  }

  return (
    <Formulario acao={acao} className="space-y-3 rounded-xl border border-saida/30 bg-saida/5 p-4">
      <input type="hidden" name="id" value={lancamento.id} />
      <p className="font-semibold text-tinta">Excluir este lançamento?</p>
      {lancamento.grupo_id && <EscopoSerie lancamento={lancamento} acao="excluir" />}
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
