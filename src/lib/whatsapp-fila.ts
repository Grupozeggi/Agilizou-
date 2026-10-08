/**
 * Decisões da fila de WhatsApp (funções puras, testadas).
 */

export type Contexto = {
  agendamento: { status: string; inicio: string } | null;
  cliente: { whatsapp: string | null; aceita_mensagens: boolean } | null;
  empresa: { whatsapp_ativo: boolean; limiteMensal: number; enviadasNoMes: number };
  agora: string;
};

export type Decisao = { acao: "enviar" } | { acao: "cancelar"; motivo: string } | { acao: "falhar"; motivo: string };

/** Confere, na hora de enviar, se a mensagem ainda faz sentido. */
export function decidirEnvio(c: Contexto): Decisao {
  if (!c.agendamento) return { acao: "cancelar", motivo: "agendamento excluído" };
  if (!["agendado", "confirmado"].includes(c.agendamento.status)) return { acao: "cancelar", motivo: `agendamento ${c.agendamento.status}` };
  if (c.agendamento.inicio <= c.agora) return { acao: "cancelar", motivo: "horário já passou" };
  if (!c.cliente?.whatsapp) return { acao: "cancelar", motivo: "cliente sem WhatsApp" };
  if (!c.cliente.aceita_mensagens) return { acao: "cancelar", motivo: "cliente pediu para não receber mensagens" };
  if (!c.empresa.whatsapp_ativo) return { acao: "cancelar", motivo: "mensagens automáticas desligadas" };
  if (c.empresa.limiteMensal <= 0) return { acao: "cancelar", motivo: "plano sem mensagens automáticas" };
  if (c.empresa.enviadasNoMes >= c.empresa.limiteMensal) return { acao: "falhar", motivo: "limite mensal do plano atingido" };
  return { acao: "enviar" };
}

/** Depois de uma falha: tenta de novo (15 min, 30 min) até 3 tentativas. */
export function proximaTentativa(tentativas: number, definitivo: boolean, agora: Date): string | null {
  if (definitivo || tentativas >= 3) return null;
  return new Date(agora.getTime() + 15 * 60_000 * tentativas).toISOString();
}

/** Celular brasileiro pode chegar com ou sem o nono dígito. */
export function variantesTelefone(numero: string): string[] {
  const m = /^55(\d{2})(9?)(\d{8})$/.exec(numero);
  if (!m) return [numero];
  const [, ddd, nove, resto] = m;
  return nove ? [numero, `55${ddd}${resto}`] : [numero, `55${ddd}9${resto}`];
}

type Payload = {
  entry?: {
    changes?: {
      value?: {
        statuses?: { id: string; status: string; errors?: { title?: string; message?: string }[] }[];
        messages?: {
          from: string;
          id: string;
          type: string;
          text?: { body: string };
          button?: { text?: string; payload?: string };
          interactive?: { button_reply?: { title?: string; id?: string } };
        }[];
      };
    }[];
  }[];
};

const STATUS: Record<string, string> = { sent: "enviada", delivered: "entregue", read: "lida", failed: "falhou" };

/** Lê o webhook da Meta: mudanças de status e respostas de clientes. */
export function lerWebhook(json: unknown) {
  const p = (json ?? {}) as Payload;
  const statuses: { id: string; status: string; erro?: string }[] = [];
  const respostas: { de: string; id: string; texto: string }[] = [];
  for (const e of p.entry ?? []) {
    for (const ch of e.changes ?? []) {
      for (const s of ch.value?.statuses ?? []) {
        if (STATUS[s.status]) statuses.push({ id: s.id, status: STATUS[s.status], erro: s.errors?.[0]?.title ?? s.errors?.[0]?.message });
      }
      for (const m of ch.value?.messages ?? []) {
        const texto = m.text?.body ?? m.button?.text ?? m.button?.payload ?? m.interactive?.button_reply?.title ?? "";
        if (texto) respostas.push({ de: m.from, id: m.id, texto });
      }
    }
  }
  return { statuses, respostas };
}
