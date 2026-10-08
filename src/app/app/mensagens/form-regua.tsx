"use client";

import { useActionState, useState } from "react";
import { Aviso, Botao, Cartao } from "@/components/ui";
import { preencher } from "@/lib/mensagens";
import { NOMES_ETAPA, type PassoRegua } from "@/lib/regua";
import { salvarRegua } from "./acoes";

const VARIAVEIS = ["{nome}", "{data}", "{hora}", "{profissional}", "{servico}", "{empresa}"];

export function FormRegua({ ativo, regua, empresa, bloqueado }: { ativo: boolean; regua: PassoRegua[]; empresa: string; bloqueado: boolean }) {
  const [estado, acao, salvando] = useActionState(salvarRegua, {});
  const [textos, setTextos] = useState(() => Object.fromEntries(regua.map((p) => [p.etapa, p.modelo])));
  const exemplo = { nome: "Ana", data: "15/10", hora: "14:00", profissional: "Carla", servico: "Corte", empresa };

  return (
    <form action={acao} className="space-y-3">
      {estado.sucesso && <Aviso tipo="sucesso">{estado.sucesso}</Aviso>}
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      <Cartao className="p-4">
        <label className="flex min-h-11 items-center justify-between gap-3 font-medium text-tinta">
          Enviar lembretes automáticos
          <input type="checkbox" name="whatsapp_ativo" defaultChecked={ativo} disabled={bloqueado} className="size-6 accent-royal-vivo" />
        </label>
        <p className="text-xs text-suave">Só para clientes com WhatsApp cadastrado e que aceitam mensagens.</p>
      </Cartao>
      {regua.map((p) => (
        <Cartao key={p.etapa} className="space-y-2 p-4">
          <label className="flex items-center justify-between gap-3 text-sm font-semibold text-tinta">
            {NOMES_ETAPA[p.etapa]}
            <input type="checkbox" name={`ativo_${p.etapa}`} defaultChecked={p.ativo} className="size-5 accent-royal-vivo" />
          </label>
          <textarea
            name={`modelo_${p.etapa}`}
            value={textos[p.etapa]}
            onChange={(e) => setTextos({ ...textos, [p.etapa]: e.target.value })}
            rows={3}
            maxLength={700}
            className="w-full rounded-xl border border-borda px-3 py-2 text-sm outline-none focus:border-royal-vivo"
          />
          {estado.erros?.[`modelo_${p.etapa}`] && <p className="text-sm text-saida">{estado.erros[`modelo_${p.etapa}`]}</p>}
          <p className="rounded-xl bg-entrada/5 px-3 py-2 text-xs text-texto">
            <span className="font-semibold text-entrada">Prévia: </span>
            {preencher(textos[p.etapa], exemplo)}
          </p>
        </Cartao>
      ))}
      <p className="px-1 text-xs text-suave">Variáveis: {VARIAVEIS.join(" ")}</p>
      <Botao type="submit" disabled={salvando}>
        {salvando ? "Salvando..." : "Salvar mensagens"}
      </Botao>
    </form>
  );
}
