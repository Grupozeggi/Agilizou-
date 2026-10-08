/**
 * Dinheiro no Agilizou é SEMPRE um inteiro em centavos.
 * Nunca use float para somar, subtrair ou guardar valores em R$.
 * A conversão de/para texto acontece só nas bordas (formulário e tela).
 */

export type Centavos = number;

const formatador = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** 123456 → "R$ 1.234,56" */
export function formatarReais(centavos: Centavos): string {
  garantirCentavos(centavos);
  // A divisão por 100 aqui é só para exibição; o valor guardado continua inteiro.
  // "|| 0" evita o "-R$ 0,00" do zero negativo (-0) do JavaScript.
  return formatador.format((centavos || 0) / 100).replace(/\u00a0/g, " ");
}

/**
 * Converte o que o usuário digitou em centavos, sem passar por float.
 * Aceita "1.234,56", "1234,56", "1234.56", "R$ 12", "12,5", "-3,40".
 * Retorna null se o texto não for um valor válido.
 */
export function paraCentavos(texto: string): Centavos | null {
  let s = texto.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!s) return null;

  let negativo = false;
  if (s.startsWith("-")) {
    negativo = true;
    s = s.slice(1);
  }

  const ultimaVirgula = s.lastIndexOf(",");
  const ultimoPonto = s.lastIndexOf(".");
  let inteiro: string;
  let fracao = "";

  if (ultimaVirgula >= 0) {
    // Padrão brasileiro: vírgula decimal, pontos de milhar.
    if (ultimoPonto > ultimaVirgula) return null;
    inteiro = s.slice(0, ultimaVirgula).replace(/\./g, "");
    fracao = s.slice(ultimaVirgula + 1);
  } else if (ultimoPonto >= 0 && /^\d+\.\d{1,2}$/.test(s)) {
    // "1234.56": ponto usado como decimal (teclado numérico).
    [inteiro, fracao] = s.split(".");
  } else {
    // "1.234" ou "1234": só milhar.
    if (ultimoPonto >= 0 && !/^\d{1,3}(\.\d{3})+$/.test(s)) return null;
    inteiro = s.replace(/\./g, "");
  }

  if (!/^\d+$/.test(inteiro || "0") || !/^\d{0,2}$/.test(fracao)) return null;

  const centavos = Number(inteiro || "0") * 100 + Number(fracao.padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(centavos)) return null;
  return negativo ? -centavos : centavos;
}

/** Soma uma lista de valores em centavos. */
export function somar(valores: readonly Centavos[]): Centavos {
  let total = 0;
  for (const v of valores) {
    garantirCentavos(v);
    total += v;
  }
  return total;
}

/**
 * Multiplica um preço em centavos por uma quantidade (que pode ser 1,5 kg).
 * Arredonda para o centavo mais próximo (meio centavo arredonda para cima).
 */
export function multiplicar(centavos: Centavos, quantidade: number): Centavos {
  garantirCentavos(centavos);
  // Quantidade tem no máximo 3 casas; trabalhar em milésimos evita erro de float.
  const milesimos = Math.round(quantidade * 1000);
  return Math.round((centavos * milesimos) / 1000);
}

/** Percentual com 1 casa (ex.: margem). Retorna null se a base for zero. */
export function percentual(parte: Centavos, total: Centavos): number | null {
  if (total === 0) return null;
  return Math.round((parte / total) * 1000) / 10;
}

function garantirCentavos(v: number) {
  if (!Number.isSafeInteger(v)) {
    throw new Error(`Valor em centavos inválido: ${v}`);
  }
}
