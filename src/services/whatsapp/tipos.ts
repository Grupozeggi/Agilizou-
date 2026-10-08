/**
 * Contrato de qualquer provedor de WhatsApp. Para trocar de provedor
 * (Z-API, Twilio, Gupshup...), basta criar outro arquivo que implemente
 * esta interface e escolher em ./index.ts.
 */
export type ResultadoEnvio = { ok: true; id: string } | { ok: false; erro: string; definitivo: boolean };

export interface ProvedorWhatsapp {
  nome: string;
  /** Mensagem iniciada pela empresa (fora da janela de 24h): usa template aprovado. */
  enviarLembrete(telefone: string, texto: string): Promise<ResultadoEnvio>;
  /** Resposta livre, dentro da janela de 24h após o cliente escrever. */
  enviarTexto(telefone: string, texto: string): Promise<ResultadoEnvio>;
}
