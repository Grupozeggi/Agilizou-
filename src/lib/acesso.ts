/**
 * Regras de acesso compartilhadas entre o proxy e as páginas.
 * O banco (RLS) é a proteção definitiva; isto aqui decide o que a tela mostra.
 */

export type Claims = {
  sub: string;
  email?: string;
  aal?: string;
  app_metadata?: { role?: string } & Record<string, unknown>;
};

/** Papel de admin vem só de app_metadata (o usuário não consegue editar). */
export function temPapelAdmin(claims: Claims | null | undefined): boolean {
  return claims?.app_metadata?.role === "admin";
}

/** Admin com a verificação em duas etapas concluída nesta sessão. */
export function adminCom2fa(claims: Claims | null | undefined): boolean {
  return temPapelAdmin(claims) && claims?.aal === "aal2";
}

/** Só aceita redirecionar para caminhos internos (evita open redirect). */
export function caminhoSeguro(destino: string | null | undefined, padrao = "/app"): string {
  if (!destino || !destino.startsWith("/") || destino.startsWith("//") || destino.includes("\\")) {
    return padrao;
  }
  return destino;
}
