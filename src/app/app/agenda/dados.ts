import "server-only";
import type { StatusAgenda } from "@/lib/agenda";
import type { criarClienteServidor } from "@/lib/supabase/servidor";

type Supabase = Awaited<ReturnType<typeof criarClienteServidor>>;

export type Atendimento = {
  id: string;
  inicio: string;
  fim: string;
  status: StatusAgenda;
  observacao: string | null;
  venda_id: string | null;
  /** "link" quando o próprio cliente marcou pelo link público. */
  origem: "app" | "link";
  cliente: { id: string; nome: string; whatsapp: string | null } | null;
  profissional: { id: string; nome: string } | null;
  servico: { id: string; nome: string; preco_centavos: number } | null;
};

export const CAMPOS_ATENDIMENTO =
  "id, inicio, fim, status, observacao, venda_id, origem, cliente:clientes(id, nome, whatsapp), profissional:profissionais(id, nome), servico:servicos(id, nome, preco_centavos)";

export async function atendimentosEntre(supabase: Supabase, de: string, ate: string): Promise<Atendimento[]> {
  const { data, error } = await supabase
    .from("agendamentos")
    .select(CAMPOS_ATENDIMENTO)
    .is("deleted_at", null)
    .gte("inicio", `${de}T00:00:00-03:00`)
    .lte("inicio", `${ate}T23:59:59-03:00`)
    .order("inicio")
    .returns<Atendimento[]>();
  if (error) throw new Error("Não foi possível carregar a agenda.");
  return data;
}

export async function cadastrosAgenda(supabase: Supabase) {
  const [profissionais, servicos, clientes, empresa] = await Promise.all([
    supabase.from("profissionais").select("id, nome").is("deleted_at", null).order("nome").then((r) => r.data ?? []),
    supabase.from("servicos").select("id, nome, preco_centavos, duracao_minutos").is("deleted_at", null).order("nome").then((r) => r.data ?? []),
    supabase.from("clientes").select("id, nome").is("deleted_at", null).order("nome").range(0, 1999).then((r) => r.data ?? []),
    supabase.from("empresas").select("horario_abertura, horario_fechamento, dias_funcionamento").single().then((r) => r.data),
  ]);
  return {
    profissionais,
    servicos,
    clientes,
    horario: {
      abertura: (empresa?.horario_abertura ?? "08:00").slice(0, 5),
      fechamento: (empresa?.horario_fechamento ?? "18:00").slice(0, 5),
      dias: (empresa?.dias_funcionamento as number[] | undefined) ?? [1, 2, 3, 4, 5, 6],
    },
  };
}
