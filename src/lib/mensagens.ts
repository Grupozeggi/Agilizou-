/**
 * Textos para WhatsApp: telefone, link wa.me e modelos com variáveis
 * ({nome}, {data}, {hora}, {valor}, {profissional}, {servico}, {empresa}).
 */

/**
 * Deixa o número no formato internacional só com dígitos (5511999998888).
 * Aceita "(11) 99999-8888", "+55 11 99999-8888", "11999998888".
 * Retorna null se não parecer um celular/telefone válido.
 */
export function normalizarWhatsapp(texto: string | null | undefined): string | null {
  let d = (texto ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  // Número brasileiro sem DDI (DDD + 8 ou 9 dígitos).
  if (d.length === 10 || d.length === 11) d = "55" + d;
  if (d.length < 12 || d.length > 15) return null;
  if (d.startsWith("55") && !/^55[1-9]{2}\d{8,9}$/.test(d)) return null;
  return d;
}

/** "5511999998888" → "(11) 99999-8888" */
export function formatarWhatsapp(numero: string): string {
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(numero);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : `+${numero}`;
}

/** Link que abre o WhatsApp com a mensagem pronta. */
export function linkWhatsapp(numero: string | null, mensagem: string): string {
  const texto = encodeURIComponent(mensagem);
  return numero ? `https://wa.me/${numero}?text=${texto}` : `https://wa.me/?text=${texto}`;
}

export type Variaveis = Partial<Record<"nome" | "data" | "hora" | "valor" | "profissional" | "servico" | "empresa", string>>;

/** Troca {variavel} pelo valor. Variável desconhecida fica como está. */
export function preencher(modelo: string, vars: Variaveis): string {
  return modelo.replace(/\{(\w+)\}/g, (inteiro, nome: string) => vars[nome as keyof Variaveis] ?? inteiro);
}

export const MODELO_COBRANCA =
  "Oi, {nome}, tudo bem? Passando para lembrar do pagamento de {valor}, com vencimento em {data}. Se já pagou, desconsidere. Obrigado! {empresa}";
