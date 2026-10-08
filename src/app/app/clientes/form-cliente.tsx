"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Aviso, Botao, Campo } from "@/components/ui";
import { formatarWhatsapp } from "@/lib/mensagens";
import { salvarCliente } from "./acoes";
import { Formulario } from "@/components/formulario";

type Cliente = { id: string; nome: string; whatsapp: string | null; observacoes: string | null; aceita_mensagens: boolean };

export function FormCliente({ cliente, termo, voltar, avisoLimite }: { cliente?: Cliente; termo: string; voltar?: string; avisoLimite?: string }) {
  const [estado, acao, salvando] = useActionState(salvarCliente, {});
  const erros = estado.erros ?? {};
  return (
    <Formulario acao={acao} className="space-y-4">
      {avisoLimite && !estado.erro && <Aviso tipo="info">{avisoLimite}</Aviso>}
      {estado.erro && (
        <Aviso>
          {estado.erro}
          {estado.limiteAtingido && (
            <Link href="/app/assinatura" className="mt-2 block font-semibold underline">
              Fazer upgrade
            </Link>
          )}
        </Aviso>
      )}
      {cliente && <input type="hidden" name="id" value={cliente.id} />}
      {voltar && <input type="hidden" name="voltar" value={voltar} />}
      <Campo rotulo={`Nome do ${termo}`} nome="nome" defaultValue={cliente?.nome} maxLength={120} erro={erros.nome} autoFocus={!cliente} />
      <Campo
        rotulo="WhatsApp"
        nome="whatsapp"
        inputMode="tel"
        placeholder="(11) 99999-8888"
        defaultValue={cliente?.whatsapp ? formatarWhatsapp(cliente.whatsapp) : ""}
        erro={erros.whatsapp}
      />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-tinta">Observações</span>
        <textarea
          name="observacoes"
          rows={3}
          maxLength={1000}
          defaultValue={cliente?.observacoes ?? ""}
          className="w-full rounded-xl border border-borda px-4 py-3 text-base outline-none focus:border-royal-vivo"
        />
      </label>
      <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-texto">
        Aceita mensagens automáticas no WhatsApp
        <input type="checkbox" name="aceita_mensagens" defaultChecked={cliente?.aceita_mensagens ?? true} className="size-6 accent-royal-vivo" />
      </label>
      <Botao type="submit" disabled={salvando}>
        {salvando ? "Salvando..." : cliente ? "Salvar alterações" : "Cadastrar"}
      </Botao>
    </Formulario>
  );
}
