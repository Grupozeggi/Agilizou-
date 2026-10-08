/**
 * Regras do link público de agendamento (funções puras, testadas).
 * O banco confere tudo de novo na hora de gravar (agendar_online): aqui é só
 * para montar a tela com os dias e horários que o cliente pode escolher.
 */
import { horariosLivres, instanteSp, paraMinutos, partesSp } from "./agenda";
import { somarDias } from "./datas";

export type AgendaPublica = {
  /** `logo_versao`: hora da última troca da logo; null quando a empresa não tem logo. */
  empresa: { nome: string; nicho: string; mensagem: string | null; logo_versao: number | null };
  horario: {
    abertura: string;
    fechamento: string;
    dias: number[];
    dias_adiante: number;
    antecedencia_horas: number;
    datas_fechadas: string[];
  };
  profissionais: { id: string; nome: string }[];
  servicos: { id: string; nome: string; duracao_minutos: number; preco_centavos: number | null }[];
  ocupados: { profissional: string; inicio: string; fim: string }[];
};

/** Duração usada quando a empresa não cadastrou serviços. */
export const DURACAO_PADRAO = 30;

/**
 * "Barbearia do Zé (demonstração)" → "barbearia-do-ze-demonstracao".
 * Mesma regra de public.gerar_slug() no banco.
 */
export function gerarSlug(nome: string): string {
  const s = nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 50)
    .replace(/^-+|-+$/g, "");
  if (s.length >= 3) return s;
  return s ? `empresa-${s}` : "empresa";
}

/** Mesmo formato exigido pelo banco (empresas_slug_formato). */
export const slugValido = (s: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length >= 3 && s.length <= 60;

const diaDaSemana = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

/** Dias em que dá para marcar, de hoje até o limite escolhido pela empresa. */
export function diasAbertos(horario: AgendaPublica["horario"], hoje: string): string[] {
  const fechadas = new Set(horario.datas_fechadas);
  const dias: string[] = [];
  for (let i = 0; i <= horario.dias_adiante; i++) {
    const d = somarDias(hoje, i);
    if (horario.dias.includes(diaDaSemana(d)) && !fechadas.has(d)) dias.push(d);
  }
  return dias;
}

/**
 * Horários livres de um dia para um serviço de `duracao` minutos.
 * Com `profissional` = null ("tanto faz"), basta um profissional estar livre.
 * Respeita a antecedência mínima a partir de `agoraIso`.
 */
export function horariosDoDia(opcoes: {
  agenda: Pick<AgendaPublica, "horario" | "profissionais" | "ocupados">;
  dia: string;
  duracao: number;
  profissional: string | null;
  agoraIso: string;
}): string[] {
  const { agenda, dia, duracao, profissional, agoraIso } = opcoes;
  const { horario } = agenda;
  if (!horario.dias.includes(diaDaSemana(dia)) || horario.datas_fechadas.includes(dia)) return [];

  const minimo = new Date(agoraIso).getTime() + horario.antecedencia_horas * 3_600_000;
  const candidatos = profissional ? agenda.profissionais.filter((p) => p.id === profissional) : agenda.profissionais;
  const livres = new Set<string>();

  for (const p of candidatos) {
    const ocupados = agenda.ocupados
      .filter((o) => o.profissional === p.id)
      .flatMap((o) => {
        const ini = partesSp(o.inicio);
        const fim = partesSp(o.fim);
        if (ini.data > dia || fim.data < dia) return [];
        // atendimento que atravessa a meia-noite ocupa até o fim (ou desde o começo) do dia
        return [{ inicio: ini.data < dia ? 0 : paraMinutos(ini.hora), fim: fim.data > dia ? 24 * 60 : paraMinutos(fim.hora) }];
      });
    for (const h of horariosLivres({ abertura: horario.abertura, fechamento: horario.fechamento, duracao, ocupados })) {
      if (new Date(instanteSp(dia, h)).getTime() >= minimo) livres.add(h);
    }
  }
  return [...livres].sort();
}

/** Primeiro dia aberto que ainda tem horário (para já abrir a tela nele). */
export function primeiroDiaComHorario(opcoes: {
  agenda: Pick<AgendaPublica, "horario" | "profissionais" | "ocupados">;
  hoje: string;
  duracao: number;
  profissional: string | null;
  agoraIso: string;
}): string | null {
  const { agenda, hoje, ...resto } = opcoes;
  return diasAbertos(agenda.horario, hoje).find((dia) => horariosDoDia({ agenda, dia, ...resto }).length > 0) ?? null;
}

const SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** '2026-10-09' → { semana: 'sexta', dia: '09', mes: 'out' } */
export function rotuloDoDia(iso: string): { semana: string; dia: string; mes: string } {
  const [, m, d] = iso.split("-");
  return { semana: SEMANA[diaDaSemana(iso)], dia: d, mes: MESES[Number(m) - 1] };
}
