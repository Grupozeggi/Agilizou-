/**
 * Regras da agenda de atendimentos (funções puras, testadas).
 * Horários no fuso de São Paulo (UTC−3, sem horário de verão desde 2019).
 */
import { somarDias } from "./datas";
import { percentual } from "./dinheiro";

export const STATUS_AGENDA = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  compareceu: "Compareceu",
  faltou: "Faltou",
  cancelado: "Cancelado",
  remarcado: "Remarcado",
} as const;
export type StatusAgenda = keyof typeof STATUS_AGENDA;

/** '2026-10-08' + '14:30' → '2026-10-08T14:30:00-03:00' */
export function instanteSp(data: string, hora: string): string {
  return `${data}T${hora}:00-03:00`;
}

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", ...o });
const fmtData = fmt({ year: "numeric", month: "2-digit", day: "2-digit" });
const fmtHora = fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Data e hora (SP) de um instante do banco. */
export function partesSp(instante: string): { data: string; hora: string } {
  const d = new Date(instante);
  return { data: fmtData.format(d), hora: fmtHora.format(d) };
}

export const paraMinutos = (hora: string) => {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
};
export const paraHora = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * Horários livres num dia para um serviço de `duracao` minutos, de 15 em 15,
 * dentro do expediente e sem encostar em nenhum atendimento ocupado.
 * `ocupados` em minutos desde 00:00. `aPartirDe` esconde horários que já passaram.
 */
export function horariosLivres(opcoes: {
  abertura: string;
  fechamento: string;
  duracao: number;
  ocupados: { inicio: number; fim: number }[];
  passo?: number;
  aPartirDe?: number;
}): string[] {
  const { duracao, ocupados, passo = 15 } = opcoes;
  const abre = paraMinutos(opcoes.abertura);
  const fecha = paraMinutos(opcoes.fechamento);
  const livres: string[] = [];
  for (let t = abre; t + duracao <= fecha; t += passo) {
    if (opcoes.aPartirDe !== undefined && t < opcoes.aPartirDe) continue;
    const conflito = ocupados.some((o) => t < o.fim && t + duracao > o.inicio);
    if (!conflito) livres.push(paraHora(t));
  }
  return livres;
}

/** Minutos de expediente no período (dias de funcionamento × horas × profissionais). */
export function minutosDisponiveis(opcoes: {
  inicio: string;
  fim: string;
  dias: number[];
  abertura: string;
  fechamento: string;
  profissionais: number;
}): number {
  const porDia = paraMinutos(opcoes.fechamento) - paraMinutos(opcoes.abertura);
  let total = 0;
  for (let d = opcoes.inicio; d <= opcoes.fim; d = somarDias(d, 1)) {
    if (opcoes.dias.includes(new Date(`${d}T12:00:00Z`).getUTCDay())) total += porDia;
  }
  return total * opcoes.profissionais;
}

export type Indicadores = {
  total: number;
  compareceu: number;
  faltou: number;
  receita_perdida: number;
  minutos_ocupados: number;
  faltas_por_cliente: { cliente: string; faltas: number }[];
  clientes_atendidos_90d: number;
  clientes_que_voltaram_90d: number;
};

/** Taxas em % (1 casa). Comparecimento e falta contam só quem já tinha horário passado. */
export function taxas(i: Indicadores, minutosLivresTotais: number) {
  const decididos = i.compareceu + i.faltou;
  return {
    comparecimento: percentual(i.compareceu, decididos),
    falta: percentual(i.faltou, decididos),
    retorno: percentual(i.clientes_que_voltaram_90d, i.clientes_atendidos_90d),
    ocupacao: percentual(i.minutos_ocupados, minutosLivresTotais),
    horasVagas: Math.max(0, Math.round((minutosLivresTotais - i.minutos_ocupados) / 6) / 10),
  };
}
