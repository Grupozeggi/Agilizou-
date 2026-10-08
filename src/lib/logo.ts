/**
 * Logo da empresa (mostrada no link de agendamento).
 * A imagem é reduzida no navegador e guardada como texto no formato
 * "data:image/png;base64,....". Aqui ficam os limites e a conferência,
 * usados no navegador, na Server Action e na rota que entrega a imagem.
 * As mesmas regras estão no banco (tabela logos_empresa).
 */

/** Maior lado da imagem guardada, em pixels. */
export const LADO_MAXIMO = 400;
/** Tamanho máximo do texto guardado (igual ao check do banco). */
export const TAMANHO_MAXIMO = 300_000;
/** Maior arquivo que aceitamos abrir no navegador antes de reduzir (10 MB). */
export const ARQUIVO_MAXIMO = 10 * 1024 * 1024;
export const TIPOS_ACEITOS = ["image/png", "image/jpeg", "image/webp"] as const;
export type TipoLogo = (typeof TIPOS_ACEITOS)[number];

const FORMATO = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

/** O começo do arquivo precisa combinar com o tipo declarado. */
function assinaturaConfere(tipo: TipoLogo, b: Uint8Array): boolean {
  if (tipo === "image/png") return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (tipo === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  // WebP: "RIFF" + 4 bytes de tamanho + "WEBP"
  return b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
}

/**
 * Confere o texto da logo e devolve o tipo e os bytes da imagem.
 * Devolve null se não for uma imagem PNG, JPEG ou WebP dentro do limite.
 */
export function lerLogo(valor: unknown): { tipo: TipoLogo; bytes: Uint8Array<ArrayBuffer> } | null {
  if (typeof valor !== "string" || valor.length > TAMANHO_MAXIMO) return null;
  const m = FORMATO.exec(valor);
  if (!m) return null;
  let binario: string;
  try {
    binario = atob(m[2]);
  } catch {
    return null;
  }
  if (binario.length < 16) return null;
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  const tipo = m[1] as TipoLogo;
  return assinaturaConfere(tipo, bytes) ? { tipo, bytes } : null;
}

/** Novo tamanho mantendo a proporção, com o maior lado em `lado`. Nunca aumenta. */
export function medidasReduzidas(largura: number, altura: number, lado = LADO_MAXIMO): { largura: number; altura: number } {
  const maior = Math.max(largura, altura);
  if (!Number.isFinite(maior) || maior <= 0) return { largura: 0, altura: 0 };
  const escala = Math.min(1, lado / maior);
  return { largura: Math.max(1, Math.round(largura * escala)), altura: Math.max(1, Math.round(altura * escala)) };
}

/** Endereço da imagem na página pública. A versão muda quando a logo é trocada. */
export function caminhoDaLogo(slug: string, versao: number): string {
  return `/agendar/${slug}/logo?v=${versao}`;
}
