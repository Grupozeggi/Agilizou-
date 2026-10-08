/**
 * Códigos de barras dos produtos.
 *
 * - Produto sem código de barras próprio recebe um EAN-13 interno:
 *   "20" + código do produto com 10 dígitos + dígito verificador.
 *   (A mesma regra roda no banco, em preencher_codigos_produto.)
 * - Leitores USB/Bluetooth funcionam como teclado: "digitam" o código e dão
 *   Enter. Por isso a busca por código aceita o texto como vier e normaliza.
 */

/** Dígito verificador GTIN para o corpo (código sem o último dígito). */
export function digitoGtin(corpo: string): number {
  if (!/^\d+$/.test(corpo)) throw new Error("Corpo do GTIN deve ter só números.");
  let soma = 0;
  for (let i = 0; i < corpo.length; i++) {
    const d = Number(corpo[corpo.length - 1 - i]);
    soma += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (soma % 10)) % 10;
}

/** true para EAN-8, UPC-A (12), EAN-13 ou GTIN-14 com dígito verificador correto. */
export function gtinValido(codigo: string): boolean {
  if (!/^\d+$/.test(codigo) || ![8, 12, 13, 14].includes(codigo.length)) return false;
  return digitoGtin(codigo.slice(0, -1)) === Number(codigo.at(-1));
}

/** EAN-13 interno de um produto a partir do código sequencial. */
export function codigoBarrasInterno(codigoProduto: number): string {
  if (!Number.isSafeInteger(codigoProduto) || codigoProduto < 1 || codigoProduto > 9_999_999_999) {
    throw new Error(`Código de produto inválido: ${codigoProduto}`);
  }
  const corpo = "20" + String(codigoProduto).padStart(10, "0");
  return corpo + digitoGtin(corpo);
}

/** Código gerado pelo Agilizou (e não o da embalagem)? */
export function ehCodigoInterno(codigo: string): boolean {
  return /^20\d{11}$/.test(codigo) && gtinValido(codigo);
}

/** Limpa o que o leitor ou a pessoa digitou (espaços, quebras de linha). */
export function normalizarCodigo(texto: string): string {
  return texto.replace(/\s+/g, "").trim();
}

/**
 * Valida um código informado no cadastro do produto.
 * Só números com tamanho de GTIN precisam ter o dígito verificador certo
 * (pega erro de digitação); outros formatos são aceitos como vierem.
 */
export function validarCodigoInformado(texto: string): { ok: true; codigo: string } | { ok: false; erro: string } {
  const codigo = normalizarCodigo(texto);
  if (!codigo) return { ok: false, erro: "Digite ou bipe o código de barras." };
  if (!/^[0-9A-Za-z.\-]{1,48}$/.test(codigo)) {
    return { ok: false, erro: "Use só letras, números, ponto ou hífen (até 48 caracteres)." };
  }
  if (/^\d+$/.test(codigo) && [8, 12, 13, 14].includes(codigo.length) && !gtinValido(codigo)) {
    return { ok: false, erro: "Este código de barras não é válido. Confira se digitou certo." };
  }
  return { ok: true, codigo };
}

// --- Desenho do código de barras (EAN-13 e EAN-8) ---------------------------

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = L.map((p) => [...p].map((b) => (b === "0" ? "1" : "0")).reverse().join(""));
const R = L.map((p) => [...p].map((b) => (b === "0" ? "1" : "0")).join(""));
// Paridade da metade esquerda do EAN-13 conforme o primeiro dígito.
const PARIDADE = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/**
 * Módulos (barras) do código: string de "1" (barra) e "0" (espaço).
 * EAN-13 tem 95 módulos e EAN-8 tem 67. UPC-A é desenhado como EAN-13
 * com zero na frente (é assim que os leitores o tratam).
 * Retorna null para formatos que não são EAN (a etiqueta mostra só o texto).
 */
export function modulosEan(codigo: string): string | null {
  if (codigo.length === 12 && gtinValido(codigo)) codigo = "0" + codigo;
  if (!gtinValido(codigo)) return null;

  if (codigo.length === 13) {
    const paridade = PARIDADE[Number(codigo[0])];
    let esquerda = "";
    for (let i = 0; i < 6; i++) {
      const d = Number(codigo[i + 1]);
      esquerda += paridade[i] === "L" ? L[d] : G[d];
    }
    const direita = [...codigo.slice(7)].map((d) => R[Number(d)]).join("");
    return "101" + esquerda + "01010" + direita + "101";
  }

  if (codigo.length === 8) {
    const esquerda = [...codigo.slice(0, 4)].map((d) => L[Number(d)]).join("");
    const direita = [...codigo.slice(4)].map((d) => R[Number(d)]).join("");
    return "101" + esquerda + "01010" + direita + "101";
  }

  return null;
}

// --- Code 128 (subconjunto B): qualquer texto ASCII imprimível ---------------

const C128 = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

/**
 * Módulos do Code 128-B ("1" barra, "0" espaço), com início, dígito de
 * controle e parada. Retorna null se houver caractere fora do ASCII 32–126.
 */
export function modulosCode128(texto: string): string | null {
  if (!texto || !/^[\x20-\x7e]+$/.test(texto)) return null;
  const valores = [104, ...[...texto].map((c) => c.charCodeAt(0) - 32)];
  const soma = valores.reduce((acc, v, i) => acc + v * (i === 0 ? 1 : i), 0);
  const codigos = [...valores, soma % 103, 106];
  let modulos = "";
  for (const c of codigos) {
    [...C128[c]].forEach((largura, i) => {
      modulos += (i % 2 === 0 ? "1" : "0").repeat(Number(largura));
    });
  }
  return modulos;
}

/** Melhor forma de desenhar o código: EAN quando possível, senão Code 128. */
export function modulosCodigo(codigo: string): { tipo: "ean" | "code128"; modulos: string } | null {
  const ean = modulosEan(codigo);
  if (ean) return { tipo: "ean", modulos: ean };
  const c128 = modulosCode128(codigo);
  return c128 ? { tipo: "code128", modulos: c128 } : null;
}
