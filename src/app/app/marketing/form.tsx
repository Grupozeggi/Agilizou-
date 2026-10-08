"use client";

import { useActionState } from "react";
import { Formulario } from "@/components/formulario";
import { Aviso, Botao, Campo } from "@/components/ui";
import { pedirMarketing } from "./acoes";

export function FormMarketing({ whatsapp }: { whatsapp: string }) {
  const [estado, acao, enviando] = useActionState(pedirMarketing, {});
  return (
    <Formulario acao={acao} className="space-y-4">
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      <Campo
        rotulo="Seu WhatsApp"
        nome="whatsapp_contato"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="(11) 99999-8888"
        defaultValue={whatsapp}
        ajuda="Com DDD. É por ele que o nosso time fala com você."
        erro={estado.erros?.whatsapp_contato}
        required
      />
      <Botao type="submit" disabled={enviando}>
        {enviando ? "Enviando..." : "Quero que entrem em contato"}
      </Botao>
    </Formulario>
  );
}
