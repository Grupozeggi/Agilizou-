/**
 * CSV no padrão que o Excel brasileiro abre direto: separador ";",
 * vírgula decimal e BOM UTF-8 (para os acentos aparecerem certos).
 */
export function gerarCsv(colunas: string[], linhas: string[][]): string {
  const campo = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "\uFEFF" + [colunas, ...linhas].map((l) => l.map(campo).join(";")).join("\r\n") + "\r\n";
}

/** 123456 → "1234,56" (número puro, sem R$ nem ponto de milhar). */
export function centavosCsv(c: number): string {
  const negativo = c < 0;
  const s = String(Math.abs(c)).padStart(3, "0");
  return `${negativo ? "-" : ""}${s.slice(0, -2)},${s.slice(-2)}`;
}
