import "server-only";
import { limitesDaEmpresa, PLANOS, situacaoLimite, type Limites, type SituacaoLimite } from "@/config/planos";
import type { Empresa } from "@/lib/sessao";
import type { criarClienteServidor } from "@/lib/supabase/servidor";

type Supabase = Awaited<ReturnType<typeof criarClienteServidor>>;

export type UsoLimite = {
  usado: number;
  limite: number;
  situacao: SituacaoLimite;
  /** Mensagem pronta para mostrar quando estiver em aviso ou bloqueado. */
  mensagem?: string;
};

const NOMES: Partial<Record<keyof Limites, string>> = {
  lancamentosPorMes: "lançamentos do mês",
  produtos: "produtos",
  clientes: "clientes",
  profissionais: "profissionais",
};

function montar(empresa: Empresa, item: keyof Limites, usado: number): UsoLimite {
  const limite = limitesDaEmpresa(empresa.plano, empresa.limites_personalizados)[item];
  const situacao = situacaoLimite(usado, limite);
  const plano = PLANOS[empresa.plano].nome;
  const nome = NOMES[item] ?? String(item);
  let mensagem: string | undefined;
  if (situacao === "bloqueado") {
    mensagem = `Você chegou ao limite de ${limite} ${nome} do plano ${plano}. Seus dados continuam todos aqui; para cadastrar mais, faça o upgrade.`;
  } else if (situacao === "aviso") {
    mensagem = `Você já usou ${usado} de ${limite} ${nome} do plano ${plano}.`;
  }
  return { usado, limite, situacao, mensagem };
}

/** Uso do limite de lançamentos no mês (parcelado/recorrente conta 1). */
export async function usoLancamentos(supabase: Supabase, empresa: Empresa): Promise<UsoLimite> {
  const { data, error } = await supabase.rpc("uso_lancamentos_mes");
  if (error) throw new Error("Não foi possível verificar o limite do plano.");
  return montar(empresa, "lancamentosPorMes", Number(data ?? 0));
}
