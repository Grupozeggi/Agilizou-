import type { ComponentProps, ReactNode } from "react";

/** Botão principal: azul royal, texto branco, área de toque confortável. */
export function Botao({ className = "", variante = "principal", ...props }: ComponentProps<"button"> & {
  variante?: "principal" | "secundario";
}) {
  const estilos =
    variante === "principal"
      ? "bg-royal-vivo text-white hover:bg-royal disabled:bg-royal-vivo/60"
      : "bg-white text-royal border border-borda hover:bg-cartao";
  return (
    <button
      className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal-vivo disabled:cursor-not-allowed ${estilos} ${className}`}
      {...props}
    />
  );
}

export function Campo({
  rotulo,
  nome,
  erro,
  ajuda,
  ...props
}: ComponentProps<"input"> & { rotulo: string; nome: string; erro?: string; ajuda?: string }) {
  const idErro = erro ? `${nome}-erro` : undefined;
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-tinta">{rotulo}</span>
      <input
        name={nome}
        id={nome}
        aria-invalid={erro ? true : undefined}
        aria-describedby={idErro}
        className="h-12 w-full rounded-xl border border-borda bg-white px-4 text-base text-texto outline-none transition-colors placeholder:text-suave/60 focus:border-royal-vivo focus:ring-2 focus:ring-royal-vivo/20 aria-invalid:border-saida"
        {...props}
      />
      {erro ? (
        <span id={idErro} className="mt-1 block text-sm text-saida">
          {erro}
        </span>
      ) : ajuda ? (
        <span className="mt-1 block text-sm text-suave">{ajuda}</span>
      ) : null}
    </label>
  );
}

export function Aviso({ tipo = "erro", children }: { tipo?: "erro" | "sucesso" | "info"; children: ReactNode }) {
  const estilos = {
    erro: "border-saida/20 bg-saida/5 text-saida",
    sucesso: "border-entrada/20 bg-entrada/5 text-entrada",
    info: "border-royal-vivo/20 bg-royal-claro text-royal-escuro",
  }[tipo];
  return (
    <div role={tipo === "erro" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${estilos}`}>
      {children}
    </div>
  );
}

export function Cartao({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`rounded-cartao bg-white p-6 shadow-suave ${className}`} {...props} />;
}
