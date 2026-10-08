"use client";

import { useActionState, useState, useTransition } from "react";
import { LifeBuoy } from "lucide-react";
import { Formulario } from "@/components/formulario";
import { Aviso, Botao } from "@/components/ui";
import type { Limites } from "@/config/planos";
import type { EstadoForm } from "@/lib/formulario";
import { alterarConta, entrarModoSuporte, redefinirSenha, restaurarLancamento, salvarLimites } from "../../acoes";

export function BotaoSuporte({ empresa }: { empresa: string }) {
  const [pendente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendente}
      onClick={() => iniciar(() => entrarModoSuporte(empresa))}
      className="inline-flex h-11 items-center gap-2 rounded-xl bg-dourado px-4 text-sm font-semibold text-royal-escuro"
    >
      <LifeBuoy className="size-4" /> Entrar como cliente (modo suporte)
    </button>
  );
}

export function AcoesConta({ empresa, plano }: { empresa: string; plano: string }) {
  const [estado, acao, salvando] = useActionState(alterarConta, {});
  return (
    <div className="space-y-3">
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      {estado.sucesso && <Aviso tipo="sucesso">{estado.sucesso}</Aviso>}
      <Formulario acao={acao} className="flex gap-2">
        <input type="hidden" name="empresa" value={empresa} />
        <input type="hidden" name="acao" value="plano" />
        <select name="plano" defaultValue={plano} className="h-11 flex-1 rounded-xl border border-borda bg-white px-3 text-sm">
          <option value="essencial">Essencial</option>
          <option value="profissional">Profissional</option>
        </select>
        <button type="submit" disabled={salvando} className="h-11 rounded-xl border border-borda px-3 text-sm font-semibold text-royal">
          Alterar plano
        </button>
      </Formulario>
      <Formulario acao={acao} className="flex gap-2">
        <input type="hidden" name="empresa" value={empresa} />
        <input type="hidden" name="acao" value="estender" />
        <input name="dias" type="number" min={1} max={365} defaultValue={7} className="h-11 w-24 rounded-xl border border-borda px-3 text-sm" />
        <button type="submit" disabled={salvando} className="h-11 flex-1 rounded-xl border border-borda px-3 text-sm font-semibold text-royal">
          Estender teste (dias)
        </button>
      </Formulario>
      <div className="flex gap-2">
        {(["suspender", "reativar"] as const).map((a) => (
          <Formulario
            key={a}
            acao={acao}
            className="flex-1"
            onSubmit={(e) => {
              if (a === "suspender" && !confirm("Suspender a conta? Ela fica somente leitura.")) e.preventDefault();
            }}
          >
            <input type="hidden" name="empresa" value={empresa} />
            <input type="hidden" name="acao" value={a} />
            <Botao type="submit" variante={a === "suspender" ? "perigo" : "secundario"} disabled={salvando}>
              {a === "suspender" ? "Suspender" : "Reativar"}
            </Botao>
          </Formulario>
        ))}
      </div>
    </div>
  );
}

export function BotaoSenha({ empresa }: { empresa: string }) {
  const [msg, setMsg] = useState<EstadoForm>({});
  const [pendente, iniciar] = useTransition();
  return (
    <div className="space-y-2">
      {msg.erro && <Aviso>{msg.erro}</Aviso>}
      {msg.sucesso && <Aviso tipo="sucesso">{msg.sucesso}</Aviso>}
      <Botao
        type="button"
        variante="secundario"
        disabled={pendente}
        onClick={() => {
          if (confirm("Enviar link de nova senha para o e-mail do cliente?")) iniciar(async () => setMsg(await redefinirSenha(empresa)));
        }}
      >
        Redefinir senha (envia link por e-mail)
      </Botao>
    </div>
  );
}

const CAMPOS: [keyof Limites, string][] = [
  ["lancamentosPorMes", "Lançamentos/mês"],
  ["produtos", "Produtos"],
  ["clientes", "Clientes"],
  ["profissionais", "Profissionais"],
  ["exportacoesPorMes", "Exportações/mês"],
  ["mensagensWhatsappPorMes", "WhatsApp/mês"],
];

export function FormLimites({ empresa, personalizados, doPlano }: { empresa: string; personalizados: Partial<Limites>; doPlano: Limites }) {
  const [estado, acao, salvando] = useActionState(salvarLimites, {});
  return (
    <Formulario acao={acao} className="space-y-3">
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      {estado.sucesso && <Aviso tipo="sucesso">{estado.sucesso}</Aviso>}
      <input type="hidden" name="empresa" value={empresa} />
      <div className="grid grid-cols-2 gap-2">
        {CAMPOS.map(([c, r]) => (
          <label key={c} className="text-xs text-suave">
            {r}
            <input
              name={c}
              type="number"
              min={0}
              defaultValue={personalizados[c] ?? ""}
              placeholder={doPlano[c] === Infinity ? "ilimitado" : String(doPlano[c])}
              className="mt-1 h-10 w-full rounded-lg border border-borda px-2 text-sm text-texto"
            />
            {estado.erros?.[c] && <span className="text-saida">{estado.erros[c]}</span>}
          </label>
        ))}
      </div>
      <Botao type="submit" variante="secundario" disabled={salvando}>
        Salvar limites
      </Botao>
    </Formulario>
  );
}

export function BotaoRestaurar({ lancamento, empresa }: { lancamento: string; empresa: string }) {
  const [msg, setMsg] = useState<string>();
  const [pendente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendente || msg === "ok"}
      onClick={() =>
        iniciar(async () => {
          const r = await restaurarLancamento(lancamento, empresa);
          setMsg(r.erro ?? "ok");
        })
      }
      className="shrink-0 rounded-lg border border-borda px-2 py-1 text-xs font-semibold text-royal"
    >
      {msg === "ok" ? "Restaurado" : msg ?? "Restaurar"}
    </button>
  );
}
