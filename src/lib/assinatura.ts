/**
 * Regras da assinatura (funções puras, testadas).
 */
import { diasEntre } from "./datas";

export type StatusAssinatura = "teste" | "ativo" | "inadimplente" | "cancelado" | "suspenso";

/** Mesma regra do banco (empresa_pode_escrever). */
export function podeEscrever(status: StatusAssinatura, testeAte: string, agora = new Date()): boolean {
  return status === "ativo" || (status === "teste" && new Date(testeAte) > agora);
}

/** Texto do aviso de somente leitura (null quando pode gravar). */
export function mensagemSomenteLeitura(status: StatusAssinatura, testeAte: string, agora = new Date()): string | null {
  if (podeEscrever(status, testeAte, agora)) return null;
  const sufixo = "Seus dados estão guardados e você pode consultar tudo.";
  switch (status) {
    case "teste":
      return `Seu teste grátis terminou. ${sufixo} Para voltar a lançar, escolha um plano.`;
    case "inadimplente":
      return `Encontramos um pagamento em aberto. ${sufixo} Pague para voltar a lançar.`;
    case "cancelado":
      return `Sua assinatura foi cancelada. ${sufixo} Assine de novo quando quiser.`;
    default:
      return `Sua conta está suspensa. ${sufixo} Fale com o suporte.`;
  }
}

/**
 * Valor proporcional do upgrade: diferença entre os planos pelos dias que
 * faltam até a próxima cobrança (ciclo de 30 dias). Arredonda para cima.
 */
export function valorProporcional(valorAtual: number, valorNovo: number, hoje: string, proximaCobranca: string | null): number {
  const diferenca = valorNovo - valorAtual;
  if (diferenca <= 0 || !proximaCobranca) return 0;
  const dias = Math.min(30, Math.max(0, diasEntre(hoje, proximaCobranca)));
  return Math.ceil((diferenca * dias) / 30);
}

const digitos = (s: string) => s.replace(/\D/g, "");

/** Valida CPF (11) ou CNPJ (14) pelos dígitos verificadores. Retorna só números ou null. */
export function validarCpfCnpj(texto: string): string | null {
  const d = digitos(texto);
  if (/^(\d)\1+$/.test(d)) return null;
  if (d.length === 11) {
    const dv = (n: number) => {
      let soma = 0;
      for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
      const r = (soma * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return dv(9) === Number(d[9]) && dv(10) === Number(d[10]) ? d : null;
  }
  if (d.length === 14) {
    const dv = (n: number) => {
      const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const soma = pesos.reduce((s, p, i) => s + p * Number(d[i]), 0);
      const r = soma % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return dv(12) === Number(d[12]) && dv(13) === Number(d[13]) ? d : null;
  }
  return null;
}
