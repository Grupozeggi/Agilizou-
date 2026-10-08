/**
 * Regras dos avisos de vencimento (e-mail e notificação).
 * Função pura: recebe as preferências e os itens, devolve o que avisar.
 */
import { formatarData, somarDias } from "./datas";
import { formatarReais } from "./dinheiro";

export type Preferencias = { aviso_no_dia: boolean; aviso_dias_antes: number };

export type ItemAviso = {
  tipo: "pagar" | "receber" | "lembrete";
  titulo: string;
  data: string;
  valor_centavos: number | null;
};

/** Datas que geram aviso hoje: o próprio dia e/ou N dias à frente. */
export function datasDeAviso(hoje: string, p: Preferencias): string[] {
  const datas: string[] = [];
  if (p.aviso_no_dia) datas.push(hoje);
  if (p.aviso_dias_antes > 0) datas.push(somarDias(hoje, p.aviso_dias_antes));
  return datas;
}

export function montarAviso(itens: ItemAviso[], hoje: string, empresa: string) {
  const ordenados = [...itens].sort((a, b) => (a.data === b.data ? a.titulo.localeCompare(b.titulo) : a.data < b.data ? -1 : 1));
  const prefixo = { pagar: "Pagar", receber: "Receber", lembrete: "Lembrete" };
  const linhas = ordenados.map((i) => {
    const quando = i.data === hoje ? "hoje" : formatarData(i.data);
    const valor = i.valor_centavos ? ` · ${formatarReais(i.valor_centavos)}` : "";
    return `${prefixo[i.tipo]}: ${i.titulo} (${quando})${valor}`;
  });
  const hojeQtd = ordenados.filter((i) => i.data === hoje).length;
  const titulo =
    hojeQtd > 0
      ? `${empresa}: ${hojeQtd} ${hojeQtd === 1 ? "aviso" : "avisos"} para hoje`
      : `${empresa}: ${ordenados.length} ${ordenados.length === 1 ? "vencimento chegando" : "vencimentos chegando"}`;
  return { titulo, linhas, resumo: linhas.slice(0, 3).join("\n") + (linhas.length > 3 ? `\n+${linhas.length - 3}` : "") };
}

/** Escapa texto para HTML de e-mail. */
export function escaparHtml(t: string): string {
  return t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
