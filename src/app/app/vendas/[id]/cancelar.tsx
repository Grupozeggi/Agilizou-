"use client";

import { useActionState, useState } from "react";
import { Undo2 } from "lucide-react";
import { Aviso, Botao } from "@/components/ui";
import { cancelarVenda } from "../acoes";
import { Formulario } from "@/components/formulario";

export function CancelarVenda({ id, numero }: { id: string; numero: number }) {
  const [confirmando, setConfirmando] = useState(false);
  const [estado, acao, cancelando] = useActionState(cancelarVenda, {});
  if (!confirmando) {
    return (
      <button type="button" onClick={() => setConfirmando(true)} className="mx-auto flex h-11 items-center gap-2 text-sm font-semibold text-saida">
        <Undo2 className="size-4" /> Cancelar venda
      </button>
    );
  }
  return (
    <Formulario acao={acao} className="space-y-3 rounded-xl border border-saida/30 bg-saida/5 p-4">
      <input type="hidden" name="id" value={id} />
      <p className="font-semibold text-tinta">Cancelar a venda #{numero}?</p>
      <p className="text-sm text-suave">Os produtos voltam para o estoque e a entrada sai do caixa.</p>
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      <div className="flex gap-2">
        <Botao type="button" variante="secundario" onClick={() => setConfirmando(false)}>
          Voltar
        </Botao>
        <Botao type="submit" variante="perigo" disabled={cancelando}>
          {cancelando ? "Cancelando..." : "Cancelar venda"}
        </Botao>
      </div>
    </Formulario>
  );
}
