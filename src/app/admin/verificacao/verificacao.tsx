"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Aviso, Botao, Campo, Cartao } from "@/components/ui";
import { mensagemDeErroAuth } from "@/lib/erros";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import { Formulario } from "@/components/formulario";

type Etapa =
  | { tipo: "carregando" }
  | { tipo: "cadastrar"; fatorId: string; qr: string; segredo: string }
  | { tipo: "verificar"; fatorId: string };

/**
 * 2FA obrigatória para admin (TOTP: Google Authenticator, 1Password etc.).
 * Primeiro acesso: cadastra o app autenticador lendo o QR code.
 * Demais acessos: só pede o código de 6 dígitos.
 * Ao verificar, a sessão sobe para aal2 e o proxy libera /admin.
 */
export function Verificacao2fa() {
  const router = useRouter();
  const [etapa, setEtapa] = useState<Etapa>({ tipo: "carregando" });
  const [erro, setErro] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const supabase = criarClienteNavegador();
    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) return setErro(mensagemDeErroAuth(error));
      const verificado = data.totp.find((f) => f.status === "verified");
      if (verificado) return setEtapa({ tipo: "verificar", fatorId: verificado.id });

      // Remove cadastros iniciados e não concluídos antes de gerar um novo QR.
      for (const f of data.all.filter((f) => f.status === "unverified")) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const novo = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Agilizou Admin" });
      if (novo.error) return setErro(mensagemDeErroAuth(novo.error));
      setEtapa({ tipo: "cadastrar", fatorId: novo.data.id, qr: novo.data.totp.qr_code, segredo: novo.data.totp.secret });
    })();
  }, []);

  async function verificar(form: FormData) {
    if (etapa.tipo === "carregando") return;
    const codigo = String(form.get("codigo") ?? "").replace(/\D/g, "");
    if (codigo.length !== 6) return setErro("Digite os 6 números do app autenticador.");
    setEnviando(true);
    setErro(undefined);
    const { error } = await criarClienteNavegador().auth.mfa.challengeAndVerify({
      factorId: etapa.fatorId,
      code: codigo,
    });
    setEnviando(false);
    if (error) return setErro(mensagemDeErroAuth(error));
    router.replace("/admin");
    router.refresh();
  }

  return (
    <Cartao>
      <h1 className="text-2xl">Verificação em duas etapas</h1>
      {etapa.tipo === "carregando" && !erro && <p className="mt-4 text-suave">Carregando...</p>}
      {etapa.tipo === "cadastrar" && (
        <div className="mt-4 space-y-3 text-sm text-texto">
          <p>A área admin exige 2FA. Leia o QR code com seu app autenticador:</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- QR vem como data URL do Supabase */}
          <img src={etapa.qr} alt="QR code para o app autenticador" className="mx-auto size-48" />
          <p className="break-all text-suave">
            Ou digite a chave: <code className="numero">{etapa.segredo}</code>
          </p>
        </div>
      )}
      {etapa.tipo === "verificar" && (
        <p className="mt-2 text-suave">Digite o código de 6 números do seu app autenticador.</p>
      )}
      <Formulario acao={verificar} className="mt-6 space-y-4">
        {erro && <Aviso>{erro}</Aviso>}
        <Campo
          rotulo="Código"
          nome="codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="[0-9]*"
          required
          disabled={etapa.tipo === "carregando"}
        />
        <Botao type="submit" disabled={enviando || etapa.tipo === "carregando"}>
          {enviando ? "Verificando..." : "Verificar"}
        </Botao>
      </Formulario>
    </Cartao>
  );
}
