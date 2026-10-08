"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { Aviso, Botao, Campo, Cartao } from "@/components/ui";
import { removerProfissional, salvarProfissional } from "./acoes";
import { Formulario } from "@/components/formulario";

export function ListaProfissionais({ profissionais, termo }: { profissionais: { id: string; nome: string }[]; termo: string }) {
  const [estado, acao, salvando] = useActionState(salvarProfissional, {});
  const [, remover] = useActionState(removerProfissional, {});
  return (
    <div className="space-y-3">
      {profissionais.length > 0 && (
        <ul className="divide-y divide-borda overflow-hidden rounded-cartao bg-white shadow-suave">
          {profissionais.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-1 pl-4 pr-2">
              <span className="font-medium text-tinta">{p.nome}</span>
              <Formulario
                acao={remover}
                onSubmit={(e) => {
                  if (!confirm(`Remover ${p.nome} da agenda? Os atendimentos antigos continuam no histórico.`)) e.preventDefault();
                }}
              >
                <input type="hidden" name="id" value={p.id} />
                <button type="submit" className="grid size-11 place-items-center text-suave hover:text-saida" aria-label={`Remover ${p.nome}`}>
                  <Trash2 className="size-4" />
                </button>
              </Formulario>
            </li>
          ))}
        </ul>
      )}
      <Cartao>
        <Formulario acao={acao} className="space-y-3" key={profissionais.length}>
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
          <Campo rotulo={`Novo ${termo}`} nome="nome" maxLength={120} placeholder="Nome" erro={estado.erros?.nome} />
          <Botao type="submit" disabled={salvando}>
            <UserPlus className="size-4" /> Adicionar
          </Botao>
        </Formulario>
      </Cartao>
    </div>
  );
}
