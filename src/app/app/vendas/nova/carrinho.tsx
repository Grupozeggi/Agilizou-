"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Minus, PackagePlus, Plus, X } from "lucide-react";
import { CampoDinheiro } from "@/components/campo-dinheiro";
import { LeitorCodigo } from "@/components/leitor-codigo";
import { Aviso, Botao, Campo, Cartao } from "@/components/ui";
import { formatarReais, multiplicar, paraCentavos } from "@/lib/dinheiro";
import { formatarQuantidade, paraQuantidade, totaisVenda } from "@/lib/estoque";
import { FORMAS_PAGAMENTO, type FormaPagamento } from "@/lib/lancamentos";
import { registrarVenda } from "../acoes";

type Produto = {
  id: string;
  codigo: number;
  codigo_barras: string;
  nome: string;
  unidade: string;
  custo_centavos: number;
  preco_centavos: number;
  estoque: number;
};
type Servico = { id: string; nome: string; preco_centavos: number; custo_centavos: number };

type Item = {
  chave: string;
  produto_id?: string;
  servico_id?: string;
  descricao: string;
  unidade?: string;
  estoque?: number;
  quantidade: number;
  preco_unitario_centavos: number;
  custo_unitario_centavos: number;
};

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function Carrinho({
  produtos,
  servicos,
  categorias,
  categoriaPadrao,
  clientes,
  hoje,
  agendamento,
}: {
  agendamento?: { id: string; cliente_id: string; servico_id: string | null } | null;
  produtos: Produto[];
  servicos: Servico[];
  categorias: { id: string; nome: string }[];
  categoriaPadrao: string | null;
  clientes: { id: string; nome: string }[];
  hoje: string;
}) {
  const servicoDoAtendimento = servicos.find((x) => x.id === agendamento?.servico_id);
  const [itens, setItens] = useState<Item[]>(() =>
    servicoDoAtendimento
      ? [
          {
            chave: `${servicoDoAtendimento.id}-0`,
            servico_id: servicoDoAtendimento.id,
            descricao: servicoDoAtendimento.nome,
            quantidade: 1,
            preco_unitario_centavos: servicoDoAtendimento.preco_centavos,
            custo_unitario_centavos: servicoDoAtendimento.custo_centavos,
          },
        ]
      : [],
  );
  const [busca, setBusca] = useState("");
  const [aviso, setAviso] = useState<string>();
  const [desconto, setDesconto] = useState(0);
  const [forma, setForma] = useState<FormaPagamento>("pix");
  const [categoria, setCategoria] = useState(categoriaPadrao);
  const [cliente, setCliente] = useState(agendamento?.cliente_id ?? "");
  const [avulso, setAvulso] = useState(false);
  const [erro, setErro] = useState<string>();
  const [salvando, iniciar] = useTransition();

  const t = totaisVenda(itens, desconto);

  function adicionarProduto(p: Produto) {
    setAviso(undefined);
    setItens((atual) => {
      const existe = atual.find((i) => i.produto_id === p.id);
      if (existe) return atual.map((i) => (i === existe ? { ...i, quantidade: i.quantidade + 1 } : i));
      return [
        ...atual,
        {
          chave: p.id,
          produto_id: p.id,
          descricao: p.nome,
          unidade: p.unidade,
          estoque: p.estoque,
          quantidade: 1,
          preco_unitario_centavos: p.preco_centavos,
          custo_unitario_centavos: p.custo_centavos,
        },
      ];
    });
    setBusca("");
  }

  function adicionarServico(s: Servico) {
    setItens((atual) => [
      ...atual,
      {
        chave: `${s.id}-${atual.length}`,
        servico_id: s.id,
        descricao: s.nome,
        quantidade: 1,
        preco_unitario_centavos: s.preco_centavos,
        custo_unitario_centavos: s.custo_centavos,
      },
    ]);
    setBusca("");
  }

  const mudar = (chave: string, dados: Partial<Item>) =>
    setItens((atual) => atual.map((i) => (i.chave === chave ? { ...i, ...dados } : i)));

  const termo = semAcento(busca.trim());
  const resultados = termo
    ? [
        ...produtos.filter((p) => semAcento(p.nome).includes(termo)).map((p) => ({ tipo: "produto" as const, p })),
        ...servicos.filter((s) => semAcento(s.nome).includes(termo)).map((s) => ({ tipo: "servico" as const, s })),
      ].slice(0, 8)
    : [];

  function finalizar() {
    setErro(undefined);
    if (!itens.length) return setErro("Adicione pelo menos um item.");
    const payload = {
      itens: itens.map((i) => ({
        produto_id: i.produto_id ?? null,
        servico_id: i.servico_id ?? null,
        descricao: i.produto_id || i.servico_id ? null : i.descricao,
        quantidade: i.quantidade,
        preco_unitario_centavos: i.preco_unitario_centavos,
      })),
      desconto_centavos: t.desconto,
      forma_pagamento: forma,
      categoria_id: categoria,
      cliente_id: cliente || null,
      data: hoje,
      observacao: null,
      agendamento_id: agendamento?.id ?? null,
    };
    iniciar(async () => {
      try {
        const r = await registrarVenda(JSON.stringify(payload));
        if (r?.erro) setErro(r.erro);
      } catch (e) {
        if (e instanceof TypeError) setErro("Sem conexão com a internet. Confira e tente de novo.");
        else throw e;
      }
    });
  }

  return (
    <div className="space-y-4">
      {agendamento && <Aviso tipo="info">Venda do atendimento: cliente e serviço já preenchidos. Confira e finalize.</Aviso>}
      <div className="relative">
        <LeitorCodigo
          autoFocus
          placeholder="Bipe ou busque produto/serviço"
          onTexto={setBusca}
          onCodigo={(codigo) => {
            const p = produtos.find((x) => x.codigo_barras === codigo || String(x.codigo) === codigo);
            if (p) adicionarProduto(p);
            else if (resultados.length === 1) {
              const r = resultados[0];
              if (r.tipo === "produto") adicionarProduto(r.p);
              else adicionarServico(r.s);
            } else setAviso(`Nenhum produto com o código ${codigo}.`);
          }}
        />
        {resultados.length > 0 && (
          <ul className="absolute inset-x-0 top-14 z-10 divide-y divide-borda overflow-hidden rounded-xl bg-white shadow-suave ring-1 ring-borda">
            {resultados.map((r) => (
              <li key={r.tipo === "produto" ? r.p.id : r.s.id}>
                <button
                  type="button"
                  onClick={() => (r.tipo === "produto" ? adicionarProduto(r.p) : adicionarServico(r.s))}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-cartao"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-tinta">{r.tipo === "produto" ? r.p.nome : r.s.nome}</span>
                    <span className="text-xs text-suave">
                      {r.tipo === "produto" ? `Produto · ${formatarQuantidade(r.p.estoque, r.p.unidade)} em estoque` : "Serviço"}
                    </span>
                  </span>
                  <span className="numero text-sm font-semibold text-tinta">
                    {formatarReais(r.tipo === "produto" ? r.p.preco_centavos : r.s.preco_centavos)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {aviso && <Aviso tipo="info">{aviso}</Aviso>}

      {itens.length > 0 && (
        <ul className="divide-y divide-borda overflow-hidden rounded-cartao bg-white shadow-suave">
          {itens.map((i) => (
            <LinhaItem key={i.chave} item={i} mudar={(d) => mudar(i.chave, d)} remover={() => setItens((a) => a.filter((x) => x !== i))} />
          ))}
        </ul>
      )}

      {avulso ? (
        <ItemAvulso
          aoAdicionar={(descricao, preco) => {
            setItens((a) => [
              ...a,
              { chave: `avulso-${a.length}-${descricao}`, descricao, quantidade: 1, preco_unitario_centavos: preco, custo_unitario_centavos: 0 },
            ]);
            setAvulso(false);
          }}
          aoCancelar={() => setAvulso(false)}
        />
      ) : (
        <button type="button" onClick={() => setAvulso(true)} className="flex h-11 items-center gap-2 text-sm font-semibold text-royal-vivo">
          <PackagePlus className="size-4" /> Adicionar item avulso
        </button>
      )}

      <Cartao className="space-y-4 p-4">
        <CampoDinheiro nome="desconto" rotulo="Desconto" onValor={setDesconto} />
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-tinta">Forma de pagamento</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(FORMAS_PAGAMENTO).map(([v, r]) => (
              <button
                key={v}
                type="button"
                onClick={() => setForma(v as FormaPagamento)}
                aria-pressed={forma === v}
                className={`min-h-10 rounded-full border px-3 text-sm ${forma === v ? "border-royal-vivo bg-royal-claro font-semibold text-royal" : "border-borda text-texto"}`}
              >
                {r}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-tinta">Categoria</span>
            <select
              value={categoria ?? ""}
              onChange={(e) => setCategoria(e.target.value || null)}
              className="h-12 w-full rounded-xl border border-borda bg-white px-3"
            >
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-tinta">Cliente (opcional)</span>
            <select value={cliente} onChange={(e) => setCliente(e.target.value)} className="h-12 w-full rounded-xl border border-borda bg-white px-3">
              <option value="">—</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Cartao>

      <Cartao className="space-y-1 p-4 text-sm">
        <Linha rotulo="Subtotal" valor={t.subtotal} />
        {t.desconto > 0 && <Linha rotulo="Desconto" valor={-t.desconto} />}
        <div className="flex items-baseline justify-between border-t border-borda pt-2">
          <span className="font-semibold text-tinta">Total</span>
          <span className="numero text-2xl font-semibold text-tinta">{formatarReais(t.total)}</span>
        </div>
        <p className="text-xs text-suave">
          Custo {formatarReais(t.custo)} · você ganha{" "}
          <strong className={t.lucro < 0 ? "text-saida" : "text-entrada"}>{formatarReais(t.lucro)}</strong> nesta venda
        </p>
      </Cartao>

      {erro && <Aviso>{erro}</Aviso>}
      <Botao type="button" onClick={finalizar} disabled={salvando || !itens.length}>
        {salvando ? "Registrando..." : `Finalizar venda · ${formatarReais(t.total)}`}
      </Botao>
    </div>
  );
}

function LinhaItem({ item, mudar, remover }: { item: Item; mudar: (d: Partial<Item>) => void; remover: () => void }) {
  const [qtdTexto, setQtdTexto] = useState(String(item.quantidade).replace(".", ","));
  const [precoTexto, setPrecoTexto] = useState<string | null>(null);
  const semEstoque = item.produto_id !== undefined && item.estoque !== undefined && item.quantidade > item.estoque;

  // Mantém o texto da quantidade em dia quando muda pelos botões + e −.
  const qtdMostrada = paraQuantidade(qtdTexto) === item.quantidade ? qtdTexto : String(item.quantidade).replace(".", ",");

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-tinta">{item.descricao}</span>
        <button type="button" onClick={remover} className="-mr-2 -mt-1 grid size-9 place-items-center text-suave" aria-label={`Remover ${item.descricao}`}>
          <X className="size-4" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-xl border border-borda">
          <button
            type="button"
            onClick={() => item.quantidade > 1 && mudar({ quantidade: Math.round((item.quantidade - 1) * 1000) / 1000 })}
            className="grid size-10 place-items-center text-royal"
            aria-label="Diminuir"
          >
            <Minus className="size-4" />
          </button>
          <input
            value={qtdMostrada}
            inputMode="decimal"
            onChange={(e) => {
              setQtdTexto(e.target.value);
              const q = paraQuantidade(e.target.value);
              if (q && q > 0) mudar({ quantidade: q });
            }}
            className="numero w-14 text-center outline-none"
            aria-label="Quantidade"
          />
          <button
            type="button"
            onClick={() => mudar({ quantidade: Math.round((item.quantidade + 1) * 1000) / 1000 })}
            className="grid size-10 place-items-center text-royal"
            aria-label="Aumentar"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <span className="text-sm text-suave">×</span>
        <input
          value={precoTexto ?? formatarReais(item.preco_unitario_centavos).replace("R$ ", "")}
          inputMode="decimal"
          onFocus={(e) => {
            setPrecoTexto(e.target.value);
            e.target.select();
          }}
          onChange={(e) => setPrecoTexto(e.target.value)}
          onBlur={() => {
            const c = paraCentavos(precoTexto ?? "");
            if (c !== null && c >= 0) mudar({ preco_unitario_centavos: c });
            setPrecoTexto(null);
          }}
          className="numero h-10 w-24 rounded-xl border border-borda px-2 text-right outline-none focus:border-royal-vivo"
          aria-label="Preço unitário"
        />
        <span className="numero ml-auto font-semibold text-tinta">
          {formatarReais(multiplicar(item.preco_unitario_centavos, item.quantidade))}
        </span>
      </div>
      {semEstoque && (
        <p className="flex items-center gap-1 text-xs text-saida">
          <AlertTriangle className="size-3.5" /> Só tem {formatarQuantidade(item.estoque!, item.unidade)} no estoque. A venda fica com estoque negativo.
        </p>
      )}
    </li>
  );
}

function ItemAvulso({ aoAdicionar, aoCancelar }: { aoAdicionar: (d: string, p: number) => void; aoCancelar: () => void }) {
  const [descricao, setDescricao] = useState("");
  const [preco, setPreco] = useState(0);
  return (
    <Cartao className="space-y-3 p-4">
      <Campo rotulo="Descrição" nome="avulso_descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={140} autoFocus />
      <CampoDinheiro nome="avulso_preco" rotulo="Preço" onValor={setPreco} />
      <div className="flex gap-2">
        <Botao type="button" variante="secundario" onClick={aoCancelar}>
          Cancelar
        </Botao>
        <Botao type="button" disabled={!descricao.trim()} onClick={() => aoAdicionar(descricao.trim(), preco)}>
          Adicionar
        </Botao>
      </div>
    </Cartao>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="flex justify-between text-suave">
      <span>{rotulo}</span>
      <span className="numero">{formatarReais(valor)}</span>
    </div>
  );
}
