/**
 * Régua de mensagens de confirmação do agendamento (WhatsApp).
 * Padrão: 5 dias antes, 2 dias antes, 1 dia antes e no dia.
 * Função pura: decide QUANDO cada mensagem sai e monta o texto.
 */
import { somarDias } from "./datas";
import { instanteSp, partesSp } from "./agenda";

export type Etapa = "5d" | "2d" | "1d" | "dia";

export type PassoRegua = { etapa: Etapa; dias_antes: number; ativo: boolean; modelo: string };

export const RODAPE_RESPOSTA = "Responda 1 para confirmar, 2 para remarcar ou 3 para cancelar.";

export const REGUA_PADRAO: PassoRegua[] = [
  {
    etapa: "5d",
    dias_antes: 5,
    ativo: true,
    modelo: `Oi, {nome}! Passando para lembrar do seu horário de {servico} na {empresa}, dia {data} às {hora}. ${RODAPE_RESPOSTA}`,
  },
  {
    etapa: "2d",
    dias_antes: 2,
    ativo: true,
    modelo: `Oi, {nome}! Seu horário na {empresa} é {data} às {hora}, com {profissional}. ${RODAPE_RESPOSTA}`,
  },
  {
    etapa: "1d",
    dias_antes: 1,
    ativo: true,
    modelo: `Oi, {nome}! Amanhã às {hora} tem {servico} com {profissional} na {empresa}. Podemos confirmar? ${RODAPE_RESPOSTA}`,
  },
  { etapa: "dia", dias_antes: 0, ativo: true, modelo: "Oi, {nome}, tudo bem? Estamos esperando você hoje às {hora}." },
];

export const NOMES_ETAPA: Record<Etapa, string> = {
  "5d": "5 dias antes",
  "2d": "2 dias antes",
  "1d": "1 dia antes",
  dia: "No dia",
};

/** Horário de envio das mensagens "dias antes" e do dia (São Paulo). */
export const HORA_ENVIO = "09:00";
export const HORA_ENVIO_DIA = "08:00";

/**
 * Quando cada etapa ativa deve sair. Etapas cujo horário já passou não são
 * enviadas (agendamento feito com menos de 5 dias só recebe o que faz sentido).
 * A mensagem do dia sai às 8h, ou 2h antes se o atendimento for cedo; se isso
 * cair antes das 7h, não é enviada.
 */
export function planejarEnvios(inicio: string, agora: string, regua: PassoRegua[]): { etapa: Etapa; agendado_para: string }[] {
  const { data } = partesSp(inicio);
  const envios: { etapa: Etapa; agendado_para: string }[] = [];
  for (const passo of regua) {
    if (!passo.ativo) continue;
    let quando: Date;
    if (passo.dias_antes === 0) {
      quando = new Date(instanteSp(data, HORA_ENVIO_DIA));
      const limite = new Date(new Date(inicio).getTime() - 60 * 60_000);
      if (quando > limite) quando = new Date(new Date(inicio).getTime() - 2 * 60 * 60_000);
      if (quando < new Date(instanteSp(data, "07:00"))) continue;
    } else {
      quando = new Date(instanteSp(somarDias(data, -passo.dias_antes), HORA_ENVIO));
    }
    if (quando.toISOString() <= agora || quando.toISOString() >= inicio) continue;
    envios.push({ etapa: passo.etapa, agendado_para: quando.toISOString() });
  }
  return envios;
}

/** Valida a régua vinda do banco; o que estiver estranho volta ao padrão. */
export function lerRegua(bruto: unknown): PassoRegua[] {
  if (!Array.isArray(bruto)) return REGUA_PADRAO;
  return REGUA_PADRAO.map((padrao) => {
    const salvo = bruto.find((p) => p && typeof p === "object" && (p as PassoRegua).etapa === padrao.etapa) as Partial<PassoRegua> | undefined;
    if (!salvo) return padrao;
    return {
      ...padrao,
      ativo: typeof salvo.ativo === "boolean" ? salvo.ativo : padrao.ativo,
      modelo: typeof salvo.modelo === "string" && salvo.modelo.trim() ? salvo.modelo.slice(0, 700) : padrao.modelo,
    };
  });
}

/** Lê a resposta do cliente: 1 confirmar, 2 remarcar, 3 cancelar. */
export function interpretarResposta(texto: string): "confirmar" | "remarcar" | "cancelar" | null {
  const t = texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
  if (/^(1|1\W.*|confirm\w*|sim|ok|confirmado)$/.test(t)) return "confirmar";
  if (/^(2|2\W.*|remarc\w*|reagend\w*)$/.test(t)) return "remarcar";
  if (/^(3|3\W.*|cancel\w*|nao vou)$/.test(t)) return "cancelar";
  return null;
}

/** O WhatsApp (Meta) não aceita quebra de linha nem 4+ espaços em parâmetros de template. */
export function limparParametro(texto: string): string {
  return texto.replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim().slice(0, 1024);
}
