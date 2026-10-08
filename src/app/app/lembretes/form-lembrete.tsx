"use client";

import { useActionState, useState } from "react";
import { CampoDinheiro } from "@/components/campo-dinheiro";
import { Aviso, Botao, Campo } from "@/components/ui";
import type { EstadoForm } from "@/lib/formulario";
import { criarLembrete } from "./acoes";

export function FormLembrete({ hoje, clientes, aoSalvar }: { hoje: string; clientes: { id: string; nome: string }[]; aoSalvar?: () => void }) {
  const [versao, setVersao] = useState(0);
  const [tipo, setTipo] = useState<"pagar" | "cobrar" | "outro">("pagar");
  const [estado, acao, salvando] = useActionState(async (a: EstadoForm, f: FormData) => {
    const r = await criarLembrete(a, f);
    if (r.sucesso) {
      setVersao((v) => v + 1);
      aoSalvar?.();
    }
    return r;
  }, {});
  const erros = estado.erros ?? {};

  return (
    <form key={versao} action={acao} className="space-y-4">
      {estado.sucesso && <Aviso tipo="sucesso">{estado.sucesso}</Aviso>}
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-cartao p-1">
        {(
          [
            ["pagar", "Pagar"],
            ["cobrar", "Cobrar"],
            ["outro", "Outro"],
          ] as const
        ).map(([v, r]) => (
          <button
            key={v}
            type="button"
            onClick={() => setTipo(v)}
            aria-pressed={tipo === v}
            className={`h-10 rounded-lg text-sm font-semibold ${tipo === v ? "bg-white text-tinta shadow-sm" : "text-suave"}`}
          >
            {r}
          </button>
        ))}
      </div>
      <input type="hidden" name="tipo" value={tipo} />
      <Campo
        rotulo="Lembrete"
        nome="titulo"
        maxLength={140}
        placeholder={tipo === "cobrar" ? "Ex.: cobrar o Carlos" : tipo === "pagar" ? "Ex.: pagar fornecedor" : "Ex.: ligar para o contador"}
        erro={erros.titulo}
      />
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Dia" nome="data" type="date" defaultValue={hoje} erro={erros.data} />
        <CampoDinheiro nome="valor" rotulo="Valor (opcional)" erro={erros.valor} />
      </div>
      {clientes.length > 0 && tipo === "cobrar" && (
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-tinta">Cliente (para cobrar no WhatsApp)</span>
          <select name="cliente_id" className="h-12 w-full rounded-xl border border-borda bg-white px-3">
            <option value="">—</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
      )}
      <Botao type="submit" disabled={salvando}>
        {salvando ? "Salvando..." : "Criar lembrete"}
      </Botao>
    </form>
  );
}
