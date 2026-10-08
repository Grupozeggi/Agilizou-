"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Aviso, Botao, Campo, Cartao } from "@/components/ui";
import type { StatusAgenda } from "@/lib/agenda";
import { mudarStatus, remarcar } from "../acoes";
import { Formulario } from "@/components/formulario";

export function AcoesAtendimento({ id, status, hoje, jaComecou }: { id: string; status: StatusAgenda; hoje: string; jaComecou: boolean }) {
  const router = useRouter();
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();
  const [remarcando, setRemarcando] = useState(false);
  const [estado, acaoRemarcar, salvando] = useActionState(remarcar, {});
  const aberto = status === "agendado" || status === "confirmado";

  const mudar = (novo: Parameters<typeof mudarStatus>[1], confirmar?: string) => {
    if (confirmar && !confirm(confirmar)) return;
    iniciar(async () => {
      const r = await mudarStatus(id, novo).catch(() => ({ erro: "Sem conexão. Tente de novo." }));
      if (r.erro) setErro(r.erro);
      else router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {erro && <Aviso>{erro}</Aviso>}
      {aberto && (
        <div className="grid grid-cols-2 gap-2">
          {jaComecou ? (
            <>
              <Botao type="button" variante="sucesso" disabled={pendente} onClick={() => mudar("compareceu")}>
                Veio
              </Botao>
              <Botao type="button" variante="perigo" disabled={pendente} onClick={() => mudar("faltou")}>
                Faltou
              </Botao>
            </>
          ) : status === "agendado" ? (
            <Botao type="button" variante="secundario" disabled={pendente} onClick={() => mudar("confirmado")} className="col-span-2">
              Marcar como confirmado
            </Botao>
          ) : null}
          <Botao type="button" variante="secundario" onClick={() => setRemarcando(!remarcando)}>
            Remarcar
          </Botao>
          <Botao type="button" variante="secundario" disabled={pendente} onClick={() => mudar("cancelado", "Cancelar este atendimento?")}>
            Cancelar
          </Botao>
        </div>
      )}
      {(status === "compareceu" || status === "faltou" || status === "cancelado") && (
        <button type="button" disabled={pendente} onClick={() => mudar("agendado")} className="mx-auto block text-sm font-semibold text-royal-vivo underline">
          Desfazer (voltar para agendado)
        </button>
      )}
      {remarcando && (
        <Cartao className="p-4">
          <Formulario acao={acaoRemarcar} className="space-y-3">
            <input type="hidden" name="id" value={id} />
            {estado.erro && <Aviso>{estado.erro}</Aviso>}
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Novo dia" nome="data" type="date" min={hoje} defaultValue={hoje} erro={estado.erros?.data} />
              <Campo rotulo="Novo horário" nome="hora" type="time" erro={estado.erros?.hora} />
            </div>
            <Botao type="submit" disabled={salvando}>
              {salvando ? "Remarcando..." : "Confirmar novo horário"}
            </Botao>
          </Formulario>
        </Cartao>
      )}
    </div>
  );
}
