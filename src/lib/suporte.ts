/**
 * Modo suporte: o admin "entra" na conta de um cliente. O id da empresa fica
 * num cookie httpOnly e vira os cabeçalhos x-modo-suporte / x-empresa-suporte
 * nas consultas. O banco só respeita esses cabeçalhos para admin com 2FA,
 * então um cliente que forjar o cookie não ganha nada.
 */
export const COOKIE_SUPORTE = "agilizou_suporte";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function empresaDoCookie(valor: string | undefined | null): string | null {
  return valor && UUID.test(valor) ? valor : null;
}

export function cabecalhosSuporte(empresa: string | null): Record<string, string> {
  return empresa ? { "x-modo-suporte": "1", "x-empresa-suporte": empresa } : {};
}
