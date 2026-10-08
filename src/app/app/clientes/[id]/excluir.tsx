"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { Aviso, Botao } from "@/components/ui";
import { excluirCliente } from "../acoes";
import { Formulario } from "@/components/formulario";

export function ExcluirCliente({ id, nome }: { id: string; nome: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [estado, acao, excluindo] = useActionState(excluirCliente, {});
  if (!confirmando) {
    return (
      <button type="button" onClick={() => setConfirmando(true)} className="mx-auto flex h-11 items-center gap-2 text-sm font-semibold text-saida">
        <Trash2 className="size-4" /> Excluir cadastro
      </button>
    );
  }
  return (
    <Formulario acao={acao} className="space-y-3 rounded-xl border border-saida/30 bg-saida/5 p-4">
      <input type="hidden" name="id" value={id} />
      <p className="font-semibold text-tinta">Excluir “{nome}”?</p>
      <p className="text-sm text-suave">O histórico de vendas e atendimentos continua guardado.</p>
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
