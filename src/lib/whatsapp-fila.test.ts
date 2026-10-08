import { describe, expect, it } from "vitest";
import { decidirEnvio, lerWebhook, proximaTentativa, variantesTelefone, type Contexto } from "./whatsapp-fila";

const base: Contexto = {
  agendamento: { status: "agendado", inicio: "2026-10-20T17:00:00Z" },
  cliente: { whatsapp: "5511999998888", aceita_mensagens: true },
  empresa: { whatsapp_ativo: true, limiteMensal: 500, enviadasNoMes: 10 },
  agora: "2026-10-19T12:00:00Z",
};

describe("decidirEnvio", () => {
  it("envia quando está tudo certo", () => {
    expect(decidirEnvio(base)).toEqual({ acao: "enviar" });
  });
  it("não envia para cancelado ou já atendido", () => {
    expect(decidirEnvio({ ...base, agendamento: { ...base.agendamento!, status: "cancelado" } }).acao).toBe("cancelar");
    expect(decidirEnvio({ ...base, agendamento: { ...base.agendamento!, status: "compareceu" } }).acao).toBe("cancelar");
  });
  it("respeita o consentimento e o WhatsApp cadastrado", () => {
    expect(decidirEnvio({ ...base, cliente: { whatsapp: null, aceita_mensagens: true } })).toEqual({ acao: "cancelar", motivo: "cliente sem WhatsApp" });
    expect(decidirEnvio({ ...base, cliente: { whatsapp: "5511999998888", aceita_mensagens: false } }).acao).toBe("cancelar");
  });
  it("plano sem mensagens ou limite do mês atingido", () => {
    expect(decidirEnvio({ ...base, empresa: { ...base.empresa, limiteMensal: 0 } }).acao).toBe("cancelar");
    expect(decidirEnvio({ ...base, empresa: { ...base.empresa, enviadasNoMes: 500 } })).toEqual({ acao: "falhar", motivo: "limite mensal do plano atingido" });
  });
  it("horário já passou", () => {
    expect(decidirEnvio({ ...base, agora: "2026-10-20T18:00:00Z" }).acao).toBe("cancelar");
  });
});

describe("reenvio", () => {
  it("tenta de novo em 15 e 30 minutos, depois desiste", () => {
    const agora = new Date("2026-10-19T12:00:00Z");
    expect(proximaTentativa(1, false, agora)).toBe("2026-10-19T12:15:00.000Z");
    expect(proximaTentativa(2, false, agora)).toBe("2026-10-19T12:30:00.000Z");
    expect(proximaTentativa(3, false, agora)).toBeNull();
    expect(proximaTentativa(1, true, agora)).toBeNull();
  });
});

describe("telefone e webhook", () => {
  it("nono dígito", () => {
    expect(variantesTelefone("5511999998888")).toEqual(["5511999998888", "551199998888"]);
    expect(variantesTelefone("551199998888")).toEqual(["551199998888", "5511999998888"]);
  });

  it("lê status e respostas (texto e botão)", () => {
    const w = lerWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  { id: "wamid.1", status: "delivered" },
                  { id: "wamid.2", status: "failed", errors: [{ title: "Número sem WhatsApp" }] },
                ],
                messages: [
                  { from: "5511999998888", id: "m1", type: "text", text: { body: "1" } },
                  { from: "5511888887777", id: "m2", type: "button", button: { text: "3 - Cancelar" } },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(w.statuses).toEqual([
      { id: "wamid.1", status: "entregue", erro: undefined },
      { id: "wamid.2", status: "falhou", erro: "Número sem WhatsApp" },
    ]);
    expect(w.respostas).toEqual([
      { de: "5511999998888", id: "m1", texto: "1" },
      { de: "5511888887777", id: "m2", texto: "3 - Cancelar" },
    ]);
  });
});
