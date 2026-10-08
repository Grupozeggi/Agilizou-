/**
 * Datas no padrão brasileiro (dd/mm/aaaa) e no fuso de São Paulo.
 * No banco, datas sem hora ficam como 'aaaa-mm-dd' (tipo date).
 */

export const FUSO = "America/Sao_Paulo";

/** '2026-10-08' → '08/10/2026' */
export function formatarData(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** '08/10/2026' → '2026-10-08'. Retorna null se a data não existir. */
export function paraIso(br: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br.trim());
  if (!m) return null;
  const [, d, mes, a] = m;
  const data = new Date(Date.UTC(Number(a), Number(mes) - 1, Number(d)));
  if (data.getUTCDate() !== Number(d) || data.getUTCMonth() !== Number(mes) - 1) return null;
  return `${a}-${mes}-${d}`;
}

/** Data de hoje em São Paulo, no formato 'aaaa-mm-dd'. */
export function hojeIso(agora: Date = new Date()): string {
  // en-CA formata como aaaa-mm-dd
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(agora);
}

/** Soma dias a uma data 'aaaa-mm-dd'. */
export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Diferença em dias entre duas datas 'aaaa-mm-dd' (b - a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Data (aaaa-mm-dd) em São Paulo de um instante ISO (ex.: timestamptz do banco). */
export function dataSp(instante: string): string {
  return hojeIso(new Date(instante));
}
