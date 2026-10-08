/**
 * Monta a tela "Hoje": tudo o que o dono precisa fazer, por dia.
 * Itens atrasados (de dias anteriores e não feitos) aparecem no topo.
 */
import { somarDias } from "./datas";

export type TipoItem = "pagar" | "receber" | "lembrete" | "atendimento";

export type ItemAgenda = {
  id: string;
  tipo: TipoItem;
  data: string; // aaaa-mm-dd
  hora?: string; // HH:MM (atendimentos)
  titulo: string;
  detalhe?: string;
  valor_centavos?: number | null;
  /** Para cobrança: WhatsApp e nome do cliente, se houver. */
  cliente?: { nome: string; whatsapp: string | null } | null;
  /** Lembrete do tipo pagar/cobrar/outro. */
  subtipo?: "pagar" | "cobrar" | "outro";
};

export type DiaAgenda = { data: string; itens: ItemAgenda[] };

const ORDEM: Record<TipoItem, number> = { atendimento: 0, pagar: 1, receber: 2, lembrete: 3 };

function ordenar(a: ItemAgenda, b: ItemAgenda) {
  if (a.data !== b.data) return a.data < b.data ? -1 : 1;
  if (a.tipo === "atendimento" && b.tipo === "atendimento") return (a.hora ?? "") < (b.hora ?? "") ? -1 : 1;
  return ORDEM[a.tipo] - ORDEM[b.tipo];
}

/** Separa em atrasados + um grupo por dia de [hoje, hoje + dias - 1]. */
export function montarAgenda(itens: ItemAgenda[], hoje: string, dias: number) {
  const fim = somarDias(hoje, dias - 1);
  const atrasados = itens.filter((i) => i.data < hoje && i.tipo !== "atendimento").sort(ordenar);
  const porDia: DiaAgenda[] = Array.from({ length: dias }, (_, n) => {
    const data = somarDias(hoje, n);
    return { data, itens: itens.filter((i) => i.data === data).sort(ordenar) };
  });
  const total = atrasados.length + porDia.reduce((s, d) => s + d.itens.length, 0);
  return { atrasados, porDia, fim, total };
}
