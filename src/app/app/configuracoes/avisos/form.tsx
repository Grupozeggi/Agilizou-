"use client";

import { useActionState, useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { Aviso, Botao, Cartao } from "@/components/ui";
import { salvarAvisos, salvarInscricaoPush } from "./acoes";
import { Formulario } from "@/components/formulario";

type Prefs = { aviso_email: boolean; aviso_push: boolean; aviso_no_dia: boolean; aviso_dias_antes: number };

export function FormAvisos({ inicial, chavePublica }: { inicial: Prefs; chavePublica: string }) {
  const [estado, acao, salvando] = useActionState(salvarAvisos, {});

  return (
    <div className="space-y-4">
      <Cartao>
        <Formulario acao={acao} className="space-y-4">
          {estado.sucesso && <Aviso tipo="sucesso">{estado.sucesso}</Aviso>}
          {estado.erro && <Aviso>{estado.erro}</Aviso>}
          <Opcao nome="aviso_email" rotulo="Avisar por e-mail" inicial={inicial.aviso_email} />
          <Opcao nome="aviso_push" rotulo="Avisar por notificação no celular" inicial={inicial.aviso_push} />
          <Opcao nome="aviso_no_dia" rotulo="No dia do vencimento" inicial={inicial.aviso_no_dia} />
          <label className="flex items-center justify-between gap-3 text-sm text-texto">
            Avisar antes
            <select name="aviso_dias_antes" defaultValue={inicial.aviso_dias_antes} className="h-11 rounded-xl border border-borda bg-white px-3">
              <option value={0}>Não avisar antes</option>
              {[1, 2, 3, 5, 7].map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "1 dia antes" : `${n} dias antes`}
                </option>
              ))}
            </select>
          </label>
          <Botao type="submit" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </Botao>
        </Formulario>
      </Cartao>
      <AtivarPush chavePublica={chavePublica} />
    </div>
  );
}

function Opcao({ nome, rotulo, inicial }: { nome: string; rotulo: string; inicial: boolean }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-texto">
      {rotulo}
      <input type="checkbox" name={nome} defaultChecked={inicial} className="size-6 accent-royal-vivo" />
    </label>
  );
}

/** Pede permissão e inscreve este aparelho para receber notificações. */
function AtivarPush({ chavePublica }: { chavePublica: string }) {
  const [suportado, setSuportado] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<{ tipo: "sucesso" | "erro" | "info"; texto: string }>();
  const [ativando, setAtivando] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- detecção de recurso do navegador
    setSuportado("serviceWorker" in navigator && "PushManager" in window && Boolean(chavePublica));
  }, [chavePublica]);

  async function ativar() {
    setAtivando(true);
    setMsg(undefined);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setMsg({ tipo: "erro", texto: "Permissão negada. Libere as notificações do site nas configurações do navegador." });
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ParaBytes(chavePublica) });
      const r = await salvarInscricaoPush(JSON.stringify(sub.toJSON()));
      setMsg(r.erro ? { tipo: "erro", texto: r.erro } : { tipo: "sucesso", texto: r.sucesso! });
    } catch {
      setMsg({ tipo: "erro", texto: "Não foi possível ativar neste aparelho." });
    } finally {
      setAtivando(false);
    }
  }

  if (suportado === null) return null;
  return (
    <Cartao className="space-y-3">
      <h2 className="flex items-center gap-2 text-base">
        <BellRing className="size-5 text-dourado" strokeWidth={1.75} /> Notificações neste aparelho
      </h2>
      {suportado ? (
        <>
          <p className="text-sm text-suave">No iPhone, instale o Agilizou na tela inicial (Compartilhar → Adicionar à Tela de Início) antes de ativar.</p>
          {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
          <Botao type="button" variante="secundario" onClick={ativar} disabled={ativando}>
            {ativando ? "Ativando..." : "Ativar notificações"}
          </Botao>
        </>
      ) : (
        <p className="text-sm text-suave">Este navegador não aceita notificações. Os avisos por e-mail continuam funcionando.</p>
      )}
    </Cartao>
  );
}

function base64ParaBytes(base64: string) {
  const preenchido = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(preenchido);
  return Uint8Array.from(bruto, (c) => c.charCodeAt(0));
}
