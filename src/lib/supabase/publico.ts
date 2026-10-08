import "server-only";
import { createClient } from "@supabase/supabase-js";
import { envPublico } from "@/lib/env";

/**
 * Cliente do Supabase SEM sessão (papel anon), para páginas públicas como o
 * link de agendamento. O visitante não lê nenhuma tabela: só consegue chamar
 * as funções liberadas para ele no banco (agenda_publica e agendar_online).
 */
export function criarClientePublico() {
  const { url, chave } = envPublico();
  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
