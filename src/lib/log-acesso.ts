import "server-only";
import { criarClienteServico } from "@/lib/supabase/servico";

type Tentativa = {
  usuarioId: string | null;
  email: string | null;
  rota: string;
  motivo: string;
  ip: string | null;
};

/**
 * Registra uma tentativa de acesso negado (ex.: cliente abrindo /admin).
 * Falhar ao registrar nunca libera o acesso: o erro só vai para o console.
 */
export async function registrarAcessoNegado(t: Tentativa) {
  try {
    const supabase = criarClienteServico();
    const { error } = await supabase.from("log_acesso_negado").insert({
      usuario_id: t.usuarioId,
      email: t.email,
      rota: t.rota.slice(0, 300),
      motivo: t.motivo,
      ip: t.ip,
    });
    if (error) throw error;
  } catch (e) {
    console.error("[acesso negado] não foi possível registrar:", t, e);
  }
}
