import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { envPublico } from "@/lib/env";

/**
 * Cliente do Supabase para Server Components, Server Actions e Route Handlers.
 * Usa a sessão do usuário (cookies), então todas as consultas passam pela RLS.
 */
export async function criarClienteServidor() {
  // cookies() primeiro: marca a rota como dinâmica (por requisição).
  const loja = await cookies();
  const { url, chave } = envPublico();

  return createServerClient(url, chave, {
    cookies: {
      getAll() {
        return loja.getAll();
      },
      setAll(paraGravar) {
        try {
          for (const { name, value, options } of paraGravar) {
            loja.set(name, value, options);
          }
        } catch {
          // Server Components não podem gravar cookies. Tudo bem: o proxy
          // (src/proxy.ts) já renova a sessão a cada navegação.
        }
      },
    },
  });
}
