import "server-only";
import type { criarClienteServidor } from "@/lib/supabase/servidor";

type Supabase = Awaited<ReturnType<typeof criarClienteServidor>>;

/** Coloca na fila as mensagens de confirmação do agendamento (etapa 8). */
export async function planejarMensagens(_supabase: Supabase, _agendamento: string): Promise<void> {
  // implementado na etapa 8
}
