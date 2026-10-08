"use client";

import { useActionState } from "react";
import { Aviso, Botao, Campo, Cartao } from "@/components/ui";
import { salvarConfigAgenda } from "../../agenda/acoes";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function FormConfigAgenda({ inicial }: { inicial: { agenda_ativa: boolean; abertura: string; fechamento: string; dias: number[] } }) {
  const [estado, acao, salvando] = useActionState(salvarConfigAgenda, {});
  return (
    <Cartao>
      <form action={acao} className="space-y-4">
        {estado.sucesso && <Aviso tipo="sucesso">{estado.sucesso}</Aviso>}
        {estado.erro && <Aviso>{estado.erro}</Aviso>}
        <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-medium text-tinta">
          Usar agenda de atendimentos
          <input type="checkbox" name="agenda_ativa" defaultChecked={inicial.agenda_ativa} className="size-6 accent-royal-vivo" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Abre às" nome="horario_abertura" type="time" defaultValue={inicial.abertura} erro={estado.erros?.horario_abertura} />
          <Campo rotulo="Fecha às" nome="horario_fechamento" type="time" defaultValue={inicial.fechamento} erro={estado.erros?.horario_fechamento} />
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-tinta">Dias de atendimento</legend>
          <div className="grid grid-cols-7 gap-1">
            {DIAS.map((d, i) => (
              <label key={d} className="flex h-11 cursor-pointer items-center justify-center rounded-lg border border-borda text-xs font-semibold text-suave has-checked:border-royal-vivo has-checked:bg-royal-claro has-checked:text-royal">
                <input type="checkbox" name="dias_funcionamento" value={i} defaultChecked={inicial.dias.includes(i)} className="sr-only" />
                {d}
              </label>
            ))}
          </div>
        </fieldset>
        <Botao type="submit" disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar"}
        </Botao>
      </form>
    </Cartao>
  );
}
