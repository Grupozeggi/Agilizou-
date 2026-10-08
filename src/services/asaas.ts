import "server-only";

/**
 * Cliente mínimo da API do Asaas (v3). Sandbox: https://sandbox.asaas.com/api/v3
 * Produção: https://api.asaas.com/v3. A chave fica só no servidor.
 */
export class ErroAsaas extends Error {}

async function asaas<T>(caminho: string, opcoes: { method?: string; corpo?: object } = {}): Promise<T> {
  const base = process.env.ASAAS_API_URL ?? "https://sandbox.asaas.com/api/v3";
  const chave = process.env.ASAAS_API_KEY;
  if (!chave) throw new ErroAsaas("Pagamento ainda não configurado (ASAAS_API_KEY).");
  const r = await fetch(`${base}${caminho}`, {
    method: opcoes.method ?? "GET",
    headers: { access_token: chave, "Content-Type": "application/json", "User-Agent": "Agilizou" },
    body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await r.json().catch(() => ({}))) as T & { errors?: { description?: string }[] };
  if (!r.ok) throw new ErroAsaas(json.errors?.[0]?.description ?? `Asaas respondeu ${r.status}`);
  return json;
}

export type Cobranca = { id: string; status: string; value: number; dueDate: string; invoiceUrl: string; subscription?: string; externalReference?: string };
export type Assinatura = { id: string; status: string; value: number; nextDueDate: string; customer: string };

export function criarCliente(dados: { name: string; email: string; cpfCnpj: string; externalReference: string }) {
  return asaas<{ id: string }>("/customers", { method: "POST", corpo: { ...dados, notificationDisabled: false } });
}

export function atualizarCliente(id: string, dados: { name?: string; email?: string; cpfCnpj?: string }) {
  return asaas<{ id: string }>(`/customers/${id}`, { method: "PUT", corpo: dados });
}

/** billingType UNDEFINED: o cliente escolhe Pix, boleto ou cartão na fatura. */
export function criarAssinatura(dados: { customer: string; value: number; nextDueDate: string; description: string; externalReference: string }) {
  return asaas<Assinatura>("/subscriptions", {
    method: "POST",
    corpo: { ...dados, billingType: "UNDEFINED", cycle: "MONTHLY" },
  });
}

export function buscarAssinatura(id: string) {
  return asaas<Assinatura>(`/subscriptions/${id}`);
}

/** Muda o valor das próximas cobranças (updatePendingPayments = a que está em aberto também). */
export function atualizarValorAssinatura(id: string, value: number, atualizarPendentes: boolean) {
  return asaas<Assinatura>(`/subscriptions/${id}`, { method: "PUT", corpo: { value, updatePendingPayments: atualizarPendentes } });
}

export function cancelarAssinaturaAsaas(id: string) {
  return asaas<{ deleted: boolean }>(`/subscriptions/${id}`, { method: "DELETE" });
}

export async function cobrancasDaAssinatura(id: string) {
  const r = await asaas<{ data: Cobranca[] }>(`/subscriptions/${id}/payments?limit=10`);
  return r.data;
}

export function criarCobrancaAvulsa(dados: { customer: string; value: number; dueDate: string; description: string; externalReference: string }) {
  return asaas<Cobranca>("/payments", { method: "POST", corpo: { ...dados, billingType: "UNDEFINED" } });
}
