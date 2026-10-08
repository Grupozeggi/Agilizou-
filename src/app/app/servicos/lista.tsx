"use client";

import { useActionState, useState } from "react";
import { Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { CampoDinheiro } from "@/components/campo-dinheiro";
import { Aviso, Botao, Campo, Cartao } from "@/components/ui";
import { formatarReais } from "@/lib/dinheiro";
import type { EstadoForm } from "@/lib/formulario";
import { excluirServico, salvarServico } from "./acoes";
import { Formulario } from "@/components/formulario";

export type Servico = { id: string; nome: string; preco_centavos: number; custo_centavos: number; duracao_minutos: number };

export function ListaServicos({ servicos }: { servicos: Servico[] }) {
  const [editando, setEditando] = useState<string | "novo" | null>(servicos.length ? null : "novo");
  const [, excluir] = useActionState(excluirServico, {});

  return (
    <div className="space-y-3">
      {servicos.length > 0 && (
        <ul className="divide-y divide-borda overflow-hidden rounded-cartao bg-white shadow-suave">
          {servicos.map((s) =>
            editando === s.id ? (
              <li key={s.id} className="p-4">
                <FormServico servico={s} aoTerminar={() => setEditando(null)} />
              </li>
            ) : (
              <li key={s.id} className="flex items-center gap-2 py-2 pl-4 pr-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-tinta">{s.nome}</span>
                  <span className="flex items-center gap-1 text-sm text-suave">
                    <span className="numero">{formatarReais(s.preco_centavos)}</span> · <Clock className="size-3.5" /> {s.duracao_minutos} min
                  </span>
                </span>
                <button type="button" onClick={() => setEditando(s.id)} className="grid size-11 place-items-center text-suave" aria-label={`Editar ${s.nome}`}>
                  <Pencil className="size-4" />
                </button>
                <Formulario
                  acao={excluir}
                  onSubmit={(e) => {
                    if (!confirm(`Excluir o serviço "${s.nome}"?`)) e.preventDefault();
                  }}
                >
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className="grid size-11 place-items-center text-suave hover:text-saida" aria-label={`Excluir ${s.nome}`}>
                    <Trash2 className="size-4" />
                  </button>
                </Formulario>
              </li>
            ),
          )}
        </ul>
      )}
      {editando === "novo" ? (
        <Cartao>
          <FormServico aoTerminar={() => setEditando(null)} />
        </Cartao>
      ) : (
        <Botao type="button" variante="secundario" onClick={() => setEditando("novo")}>
          <Plus className="size-4" /> Novo serviço
        </Botao>
      )}
    </div>
  );
}

function FormServico({ servico, aoTerminar }: { servico?: Servico; aoTerminar: () => void }) {
  const [estado, acao, salvando] = useActionState(async (anterior: EstadoForm, form: FormData) => {
    const r = await salvarServico(anterior, form);
    if (r.sucesso) aoTerminar();
    return r;
  }, {});
  const erros = estado.erros ?? {};
  return (
    <Formulario acao={acao} className="space-y-4">
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      {servico && <input type="hidden" name="id" value={servico.id} />}
      <Campo rotulo="Nome do serviço" nome="nome" defaultValue={servico?.nome} maxLength={120} erro={erros.nome} autoFocus />
      <div className="grid grid-cols-2 gap-3">
        <CampoDinheiro nome="preco" rotulo="Preço" valorInicialCentavos={servico?.preco_centavos} erro={erros.preco} />
        <CampoDinheiro nome="custo" rotulo="Custo (opcional)" valorInicialCentavos={servico?.custo_centavos} erro={erros.custo} />
      </div>
      <Campo
        rotulo="Duração (minutos)"
        nome="duracao_minutos"
        type="number"
        inputMode="numeric"
        min={5}
        max={720}
        step={5}
        defaultValue={servico?.duracao_minutos ?? 30}
        erro={erros.duracao_minutos}
      />
      <div className="flex gap-2">
        <Botao type="button" variante="secundario" onClick={aoTerminar}>
          Cancelar
        </Botao>
        <Botao type="submit" disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar"}
        </Botao>
      </div>
    </Formulario>
  );
}
