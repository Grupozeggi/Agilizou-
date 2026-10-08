import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { caminhoSeguro } from "@/lib/acesso";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/**
 * Destino dos links enviados por e-mail (confirmação de cadastro e
 * recuperação de senha). Valida o link, cria a sessão e segue para "proximo".
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const proximo = caminhoSeguro(p.get("proximo") ?? p.get("next"));
  const tokenHash = p.get("token_hash");
  const tipo = p.get("type") as EmailOtpType | null;
  const codigo = p.get("code");

  const supabase = await criarClienteServidor();
  let ok = false;

  if (tokenHash && tipo) {
    const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
    ok = !error;
  } else if (codigo) {
    const { error } = await supabase.auth.exchangeCodeForSession(codigo);
    ok = !error;
  }

  const destino = request.nextUrl.clone();
  destino.search = "";
  if (ok) {
    destino.pathname = tipo === "recovery" ? "/redefinir-senha" : proximo;
  } else {
    destino.pathname = "/entrar";
    destino.searchParams.set("erro", "link");
  }
  return NextResponse.redirect(destino);
}
