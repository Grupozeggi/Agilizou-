/**
 * Gerador de PDF mínimo, sem dependências: texto e tabelas em Helvetica,
 * A4 retrato, com quebra de página automática e rodapé "página N de M".
 * Suficiente para os relatórios do Agilizou.
 */

export type Coluna = { rotulo: string; largura: number; direita?: boolean };
export type Secao = { titulo: string; colunas: Coluna[]; linhas: string[][]; total?: string[]; vazio?: string };
export type DocumentoPdf = { titulo: string; subtitulo?: string; secoes: Secao[] };

const A4 = { l: 595.28, a: 841.89 };
const MARGEM = 40;
const ROYAL = "0.118 0.251 0.686";
const TINTA = "0.043 0.165 0.435";
const DOURADO = "0.788 0.635 0.294";
const CINZA = "0.357 0.404 0.522";
const LINHA = "0.890 0.910 0.949";

// Larguras da Helvetica (1/1000 de em) para os caracteres 32–126.
const LARGURAS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278,
  584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667,
  944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333,
  500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/** Largura aproximada do texto em pontos (letras acentuadas = letra base). */
export function larguraTexto(texto: string, tamanho: number, negrito = false): number {
  let total = 0;
  for (const ch of texto.normalize("NFD").replace(/\p{Diacritic}/gu, "")) {
    const c = ch.charCodeAt(0);
    total += c >= 32 && c <= 126 ? LARGURAS[c - 32] : 556;
  }
  return (total * tamanho * (negrito ? 1.06 : 1)) / 1000;
}

// Caracteres fora do Latin-1 que existem na WinAnsi (cp1252).
const CP1252: Record<string, number> = { "−": 0x2d, "€": 0x80, "‚": 0x82, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97 };

/** Texto → string PDF literal em WinAnsi, com ( ) \ escapados. */
export function textoPdf(texto: string): string {
  let s = "";
  for (const ch of texto) {
    let c = ch.charCodeAt(0);
    if (CP1252[ch]) c = CP1252[ch];
    else if (c > 255) c = 63; // "?" para o que não existe na fonte
    const b = String.fromCharCode(c);
    s += b === "(" || b === ")" || b === "\\" ? `\\${b}` : b;
  }
  return `(${s})`;
}

function cortar(texto: string, largura: number, tamanho: number, negrito = false): string {
  if (larguraTexto(texto, tamanho, negrito) <= largura) return texto;
  let t = texto;
  while (t.length > 1 && larguraTexto(t + "…", tamanho, negrito) > largura) t = t.slice(0, -1);
  return t + "…";
}

type Pagina = string[];

export function gerarPdf(doc: DocumentoPdf): Uint8Array {
  const paginas: Pagina[] = [];
  let p: Pagina = [];
  let y = 0;
  const util = A4.l - 2 * MARGEM;

  const texto = (x: number, yy: number, t: string, tam: number, cor: string, negrito = false) =>
    p.push(`BT /${negrito ? "F2" : "F1"} ${tam} Tf ${cor} rg ${x.toFixed(2)} ${yy.toFixed(2)} Td ${textoPdf(t)} Tj ET`);
  const linha = (x1: number, yy: number, x2: number, cor: string, espessura = 0.6) =>
    p.push(`${cor} RG ${espessura} w ${x1.toFixed(2)} ${yy.toFixed(2)} m ${x2.toFixed(2)} ${yy.toFixed(2)} l S`);

  const novaPagina = () => {
    p = [];
    paginas.push(p);
    y = A4.a - MARGEM;
    texto(MARGEM, y - 14, "Agilizou", 16, ROYAL, true);
    texto(MARGEM + larguraTexto("Agilizou", 16, true) + 8, y - 14, doc.titulo, 11, TINTA, true);
    y -= 22;
    linha(MARGEM, y, MARGEM + 60, DOURADO, 1.2);
    y -= 16;
  };
  const garantir = (altura: number) => {
    if (y - altura < MARGEM + 24) novaPagina();
  };

  novaPagina();
  if (doc.subtitulo) {
    texto(MARGEM, y, doc.subtitulo, 9, CINZA);
    y -= 18;
  }

  for (const secao of doc.secoes) {
    garantir(60);
    texto(MARGEM, y, secao.titulo, 12, TINTA, true);
    y -= 16;
    const xs: number[] = [];
    let acc = MARGEM;
    for (const c of secao.colunas) {
      xs.push(acc);
      acc += c.largura * util;
    }
    const cabecalho = () => {
      secao.colunas.forEach((c, i) => {
        const w = c.largura * util - 6;
        const t = cortar(c.rotulo, w, 8, true);
        const x = c.direita ? xs[i] + w - larguraTexto(t, 8, true) : xs[i];
        texto(x, y, t, 8, CINZA, true);
      });
      y -= 5;
      linha(MARGEM, y, MARGEM + util, LINHA);
      y -= 11;
    };
    cabecalho();
    if (!secao.linhas.length) {
      texto(MARGEM, y, secao.vazio ?? "Sem dados no período.", 9, CINZA);
      y -= 14;
    }
    const escreverLinha = (cells: string[], negrito: boolean) => {
      if (y < MARGEM + 30) {
        novaPagina();
        texto(MARGEM, y, `${secao.titulo} (continuação)`, 10, TINTA, true);
        y -= 14;
        cabecalho();
      }
      secao.colunas.forEach((c, i) => {
        const w = c.largura * util - 6;
        const t = cortar(cells[i] ?? "", w, 9, negrito);
        const x = c.direita ? xs[i] + w - larguraTexto(t, 9, negrito) : xs[i];
        texto(x, y, t, 9, TINTA, negrito);
      });
      y -= 4;
      linha(MARGEM, y, MARGEM + util, LINHA, 0.3);
      y -= 10;
    };
    for (const l of secao.linhas) escreverLinha(l, false);
    if (secao.total) escreverLinha(secao.total, true);
    y -= 12;
  }

  // Monta o arquivo: catálogo, páginas, fontes e conteúdos.
  const objetos: string[] = [];
  const add = (o: string) => objetos.push(o) && objetos.length;
  const catalogo = add("");
  const raizPaginas = add("");
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const ids: number[] = [];
  paginas.forEach((pg, i) => {
    pg.push(`BT /F1 8 Tf ${CINZA} rg ${MARGEM} ${MARGEM - 8} Td ${textoPdf(`Agilizou · agilizou.app · página ${i + 1} de ${paginas.length}`)} Tj ET`);
    const conteudo = pg.join("\n");
    const c = add(`<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`);
    ids.push(
      add(
        `<< /Type /Page /Parent ${raizPaginas} 0 R /MediaBox [0 0 ${A4.l} ${A4.a}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`,
      ),
    );
  });
  objetos[catalogo - 1] = `<< /Type /Catalog /Pages ${raizPaginas} 0 R >>`;
  objetos[raizPaginas - 1] = `<< /Type /Pages /Kids [${ids.map((i) => `${i} 0 R`).join(" ")}] /Count ${ids.length} >>`;

  let saida = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  objetos.forEach((o, i) => {
    offsets.push(saida.length);
    saida += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = saida.length;
  saida += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  saida += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  saida += `trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Cada caractere já é um byte (WinAnsi), então latin1 preserva os offsets.
  return Uint8Array.from(Buffer.from(saida, "latin1"));
}
