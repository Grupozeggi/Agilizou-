import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com a chave service_role: IGNORA a RLS.
 * Uso restrito ao servidor: webhooks (Asaas, WhatsApp), cron e ações de admin
 * que exigem privilégio (ex.: redefinir senha). O import de "server-only"
 * quebra o build se este arquivo for parar no navegador.
 */
export function criarClienteServico() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.");
  }
  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
