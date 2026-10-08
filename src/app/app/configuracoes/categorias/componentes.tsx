"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Aviso, Botao, Campo, Cartao } from "@/components/ui";
import { criarCategoria, removerCategoria, renomearCategoria } from "./acoes";
import { Formulario } from "@/components/formulario";

export function LinhaCategoria({ id, nome }: { id: string; nome: string }) {
  const [editando, setEditando] = useState(false);
  const [estado, renomear, salvando] = useActionState(
    async (prev: Awaited<ReturnType<typeof renomearCategoria>>, form: FormData) => {
      const r = await renomearCategoria(prev, form);
      if (r.sucesso) setEditando(false);
      return r;
    },
    {},
  );
  const [estadoRemover, remover, removendo] = useActionState(removerCategoria, {});

  if (editando) {
    return (
      <li className="px-5 py-3">
        <Formulario acao={renomear} className="space-y-3">
          <input type="hidden" name="id" value={id} />
          <Campo rotulo="Nome" nome="nome" defaultValue={nome} maxLength={60} autoFocus erro={estado.erros?.nome} />
          {estado.erro && <Aviso>{estado.erro}</Aviso>}
          <div className="flex gap-2">
            <Botao type="button" variante="secundario" onClick={() => setEditando(false)}>
              Cancelar
            </Botao>
            <Botao type="submit" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </Botao>
          </div>
        </Formulario>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 py-1 pl-5 pr-2">
      <span className="flex-1 py-2 text-texto">{nome}</span>
      {estadoRemover.erro && <span className="text-xs text-saida">{estadoRemover.erro}</span>}
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="grid size-11 place-items-center rounded-full text-suave hover:bg-cartao hover:text-tinta"
        aria-label={`Renomear ${nome}`}
      >
        <Pencil className="size-4" strokeWidth={1.75} />
      </button>
      <Formulario
        acao={remover}
        onSubmit={(e) => {
          if (!confirm(`Remover a categoria "${nome}"? Os lançamentos antigos continuam com ela.`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={removendo}
          className="grid size-11 place-items-center rounded-full text-suave hover:bg-saida/5 hover:text-saida"
          aria-label={`Remover ${nome}`}
        >
          <Trash2 className="size-4" strokeWidth={1.75} />
        </button>
      </Formulario>
    </li>
  );
}

export function NovaCategoria() {
  const [estado, acao, salvando] = useActionState(criarCategoria, {});
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.sucesso) form.current?.reset();
  }, [estado]);

  return (
    <Cartao>
      <h2 className="flex items-center gap-2 text-lg">
        <Plus className="size-5 text-dourado" strokeWidth={1.75} /> Nova categoria
      </h2>
      <Formulario ref={form} acao={acao} className="mt-4 space-y-4">
        {estado.erro && <Aviso>{estado.erro}</Aviso>}
        {estado.sucesso && <Aviso tipo="sucesso">{estado.sucesso}</Aviso>}
        <Campo rotulo="Nome" nome="nome" maxLength={60} placeholder="Ex.: Marketing" erro={estado.erros?.nome} />
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-tinta">É uma...</legend>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["entrada", "Entrada"],
              ["custo", "Custo"],
              ["despesa", "Despesa"],
            ].map(([valor, rotulo]) => (
              <label
                key={valor}
                className="flex h-12 cursor-pointer items-center justify-center rounded-xl border border-borda text-sm font-medium text-texto has-checked:border-royal-vivo has-checked:bg-royal-claro has-checked:text-royal"
              >
                <input type="radio" name="classe" value={valor} defaultChecked={valor === "despesa"} className="sr-only" />
                {rotulo}
              </label>
            ))}
          </div>
          {estado.erros?.classe && <p className="mt-1 text-sm text-saida">{estado.erros.classe}</p>}
        </fieldset>
        <Botao type="submit" disabled={salvando}>
          {salvando ? "Salvando..." : "Adicionar"}
        </Botao>
      </Formulario>
    </Cartao>
  );
}
