import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { adminCom2fa, temPapelAdmin, type Claims } from "@/lib/acesso";
import { registrarAcessoNegado } from "@/lib/log-acesso";

/**
 * Roda antes de cada página:
 *  1. Renova a sessão do Supabase (cookies).
 *  2. Protege /app (precisa estar logado) e /admin (precisa ser admin com 2FA).
 * A segurança de verdade dos dados é a RLS no banco; isto aqui só evita que
 * alguém veja telas que não são para ele.
 */
export async function proxy(request: NextRequest) {
  let resposta = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !chave) return resposta;

  const supabase = createServerClient(url, chave, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(paraGravar, cabecalhos) {
        for (const { name, value } of paraGravar) request.cookies.set(name, value);
        resposta = NextResponse.next({ request });
        for (const { name, value, options } of paraGravar) resposta.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(cabecalhos ?? {})) resposta.headers.set(k, v);
      },
    },
  });

  // Não colocar código entre a criação do cliente e getClaims():
  // é aqui que a sessão é validada e renovada.
  const { data } = await supabase.auth.getClaims();
  const claims = (data?.claims ?? null) as Claims | null;
  const caminho = request.nextUrl.pathname;

  const redirecionar = (destino: string, proximo?: string) => {
    const u = request.nextUrl.clone();
    u.pathname = destino;
    u.search = proximo ? `?proximo=${encodeURIComponent(proximo)}` : "";
    const r = NextResponse.redirect(u);
    // Mantém os cookies de sessão renovados no redirecionamento.
    for (const c of resposta.cookies.getAll()) r.cookies.set(c);
    return r;
  };

  const negar = async (motivo: string) => {
    await registrarAcessoNegado({
      usuarioId: claims?.sub ?? null,
      email: claims?.email ?? null,
      rota: caminho,
      motivo,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });
    const u = request.nextUrl.clone();
    u.pathname = "/acesso-negado";
    u.search = "";
    return NextResponse.rewrite(u, { status: 403 });
  };

  if (caminho === "/admin" || caminho.startsWith("/admin/")) {
    if (!claims) return redirecionar("/entrar", caminho);
    if (!temPapelAdmin(claims)) return negar("cliente tentou acessar a área admin");
    const naVerificacao = caminho === "/admin/verificacao";
    if (!adminCom2fa(claims) && !naVerificacao) return redirecionar("/admin/verificacao");
    if (adminCom2fa(claims) && naVerificacao) return redirecionar("/admin");
    return resposta;
  }

  if (caminho === "/app" || caminho.startsWith("/app/") || caminho === "/boas-vindas") {
    if (!claims) return redirecionar("/entrar", caminho + request.nextUrl.search);
    // Admin não tem empresa própria; o acesso a clientes é pelo modo suporte.
    if (temPapelAdmin(claims)) return redirecionar("/admin");
    return resposta;
  }

  if ((caminho === "/entrar" || caminho === "/cadastro") && claims) {
    return redirecionar(temPapelAdmin(claims) ? "/admin" : "/app");
  }

  return resposta;
}

export const config = {
  matcher: [
    // Tudo, menos arquivos estáticos, imagens e rotas /api (webhooks e cron
    // validam por token próprio).
    "/((?!_next/static|_next/image|api/|sw\\.js|manifest\\.webmanifest|favicon.ico|icon.svg|logo.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
