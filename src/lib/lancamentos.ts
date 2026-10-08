/**
 * Regras de lançamentos que não podem errar: parcelas, repetições mensais e
 * situação de vencimento. Funções puras (sem banco), cobertas por testes.
 */
import type { Centavos } from "./dinheiro";
import { diasEntre } from "./datas";

export type Ocorrencia = {
  valor_centavos: Centavos;
  data: string; // aaaa-mm-dd
  numero: number; // 1..total
  total: number;
};

/**
 * Soma meses a uma data mantendo o dia original quando possível.
 * Dia que não existe no mês vira o último dia (31/01 + 1 mês = 28/02 ou 29/02),
 * e o mês seguinte volta ao dia original (31/03).
 */
export function somarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

/**
 * Divide um valor total em parcelas mensais.
 * Os centavos que sobram da divisão vão para as primeiras parcelas, então a
 * soma das parcelas é SEMPRE igual ao total (R$ 100 em 3x = 33,34 + 33,33 + 33,33).
 */
export function gerarParcelas(total: Centavos, vezes: number, primeiraData: string): Ocorrencia[] {
  validarVezes(vezes);
  if (!Number.isSafeInteger(total) || total < vezes) {
    throw new Error("Valor pequeno demais para dividir nessa quantidade de parcelas.");
  }
  const base = Math.floor(total / vezes);
  const sobra = total - base * vezes;
  return Array.from({ length: vezes }, (_, i) => ({
    valor_centavos: base + (i < sobra ? 1 : 0),
    data: somarMeses(primeiraData, i),
    numero: i + 1,
    total: vezes,
  }));
}

/** Repete o mesmo valor todo mês (aluguel, mensalidade). */
export function gerarRecorrencias(valor: Centavos, vezes: number, primeiraData: string): Ocorrencia[] {
  validarVezes(vezes);
  return Array.from({ length: vezes }, (_, i) => ({
    valor_centavos: valor,
    data: somarMeses(primeiraData, i),
    numero: i + 1,
    total: vezes,
  }));
}

function validarVezes(vezes: number) {
  if (!Number.isInteger(vezes) || vezes < 1 || vezes > 60) {
    throw new Error("Quantidade de vezes deve ser entre 1 e 60.");
  }
}

export type SituacaoConta = "vencida" | "hoje" | "proximos7" | "depois";

/** Em que grupo uma conta pendente aparece na lista de contas a pagar/receber. */
export function situacaoConta(vencimento: string, hoje: string): SituacaoConta {
  const dias = diasEntre(hoje, vencimento);
  if (dias < 0) return "vencida";
  if (dias === 0) return "hoje";
  if (dias <= 7) return "proximos7";
  return "depois";
}

/** Texto curto para o vencimento: "venceu há 3 dias", "vence amanhã"... */
export function textoVencimento(vencimento: string, hoje: string): string {
  const dias = diasEntre(hoje, vencimento);
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "vence amanhã";
  if (dias === -1) return "venceu ontem";
  if (dias < 0) return `venceu há ${-dias} dias`;
  return `vence em ${dias} dias`;
}

/** Primeiro e último dia do mês de uma data 'aaaa-mm-dd'. */
export function limitesDoMes(iso: string): { inicio: string; fim: string } {
  const inicio = `${iso.slice(0, 7)}-01`;
  const fim = somarMeses(inicio, 1);
  const [a, m, d] = fim.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10);
  return { inicio, fim: ultimo };
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** '2026-10' → 'outubro de 2026' (use maiuscula() para começar com letra maiúscula) */
export function nomeDoMes(anoMes: string): string {
  const [a, m] = anoMes.split("-").map(Number);
  return `${MESES[m - 1]} de ${a}`;
}

export const FORMAS_PAGAMENTO = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  cartao_debito: "Débito",
  cartao_credito: "Crédito",
  boleto: "Boleto",
  transferencia: "Transferência",
  outro: "Outro",
} as const;

export type FormaPagamento = keyof typeof FORMAS_PAGAMENTO;

/** Primeira letra maiúscula: "outubro de 2026" → "Outubro de 2026". */
export const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
