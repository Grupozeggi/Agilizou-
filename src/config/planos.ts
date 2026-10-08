/**
 * Planos e limites do Agilizou.
 * Este é o ÚNICO lugar onde preços e limites são definidos.
 * Para mudar um limite, altere aqui; o resto do código lê deste arquivo.
 * (Limites específicos de uma empresa podem ser sobrescritos pelo admin em
 * empresas.limites_personalizados.)
 */

export type PlanoId = "essencial" | "profissional";

export type Limites = {
  lancamentosPorMes: number;
  produtos: number;
  clientes: number;
  profissionais: number;
  /** Relatórios exportados (CSV/PDF) por mês. Infinity = ilimitado. */
  exportacoesPorMes: number;
  /** Mensagens automáticas de WhatsApp por mês. 0 = recurso indisponível. */
  mensagensWhatsappPorMes: number;
};

export type Plano = {
  id: PlanoId;
  nome: string;
  precoCentavos: number;
  destaque: boolean;
  limites: Limites;
};

export const PLANOS: Record<PlanoId, Plano> = {
  essencial: {
    id: "essencial",
    nome: "Essencial",
    precoCentavos: 9700,
    destaque: false,
    limites: {
      lancamentosPorMes: 300,
      produtos: 100,
      clientes: 200,
      profissionais: 2,
      exportacoesPorMes: 1,
      mensagensWhatsappPorMes: 0,
    },
  },
  profissional: {
    id: "profissional",
    nome: "Profissional",
    precoCentavos: 19700,
    destaque: true,
    limites: {
      lancamentosPorMes: 2000,
      produtos: 1000,
      clientes: 2000,
      profissionais: 10,
      exportacoesPorMes: Infinity,
      mensagensWhatsappPorMes: 500,
    },
  },
};

/** A partir de quanto do limite o aviso aparece. */
export const AVISO_LIMITE = 0.8;

/** Dias de teste grátis (o banco usa o mesmo valor em empresas.teste_ate). */
export const DIAS_TESTE = 7;

export type SituacaoLimite = "ok" | "aviso" | "bloqueado";

/** ok (< 80%), aviso (>= 80%) ou bloqueado (>= 100%: só novos cadastros). */
export function situacaoLimite(usado: number, limite: number): SituacaoLimite {
  if (limite === Infinity) return "ok";
  if (usado >= limite) return "bloqueado";
  if (usado >= limite * AVISO_LIMITE) return "aviso";
  return "ok";
}

/** Limites efetivos: os do plano, sobrescritos pelos personalizados da empresa. */
export function limitesDaEmpresa(plano: PlanoId, personalizados?: Partial<Limites> | null): Limites {
  return { ...PLANOS[plano].limites, ...(personalizados ?? {}) };
}
