"use client";

import { useTransition, type ComponentProps } from "react";

/**
 * <form> que envia para uma Server Action SEM limpar os campos.
 * (No React 19, <form action={...}> zera os campos depois de cada envio,
 * inclusive quando o servidor devolve erro de validação: a pessoa perderia
 * o que digitou.) Para limpar após salvar, troque a `key` do formulário.
 */
export function Formulario({
  acao,
  onSubmit,
  ...props
}: Omit<ComponentProps<"form">, "action"> & { acao: (dados: FormData) => void | Promise<void> }) {
  const [, iniciar] = useTransition();
  return (
    <form
      {...props}
      onSubmit={(e) => {
        onSubmit?.(e);
        if (e.defaultPrevented) return;
        e.preventDefault();
        const dados = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        iniciar(() => acao(dados));
      }}
    />
  );
}
