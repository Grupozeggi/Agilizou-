import { describe, expect, it } from "vitest";
import { esquemaOnboarding, esquemaPerfil, ETAPA_DO_CAMPO, TOTAL_ETAPAS } from "./validacao";

describe("validação do onboarding", () => {
  it("converte o saldo para centavos", () => {
    const r = esquemaOnboarding.parse({ nome: " Oficina do Zé ", nicho: "mecanica", saldo: "1.500,00" });
    expect(r).toEqual({ nome: "Oficina do Zé", nicho: "mecanica", saldo: 150000 });
  });

  it("aceita saldo negativo e zero", () => {
    expect(esquemaOnboarding.parse({ nome: "Loja", nicho: "varejo", saldo: "-250,90" }).saldo).toBe(-25090);
    expect(esquemaOnboarding.parse({ nome: "Loja", nicho: "varejo", saldo: "0,00" }).saldo).toBe(0);
  });

  it("recusa nicho desconhecido, nome vazio e saldo inválido", () => {
    const r = esquemaOnboarding.safeParse({ nome: " ", nicho: "padaria", saldo: "abc" });
    expect(r.success).toBe(false);
    const campos = r.error!.issues.map((i) => i.path[0]);
    expect(campos).toEqual(expect.arrayContaining(["nome", "nicho", "saldo"]));
  });
});

describe("perguntas sobre o negócio (opcionais)", () => {
  const vazio = { tempo_negocio: "", equipe: null, faturamento: "", controle_caixa: "", dificuldade: "", origem: "", quer_marketing: null, whatsapp_contato: "" };

  it("quem pula todas as perguntas passa, sem pedido de marketing", () => {
    const r = esquemaPerfil.parse(vazio);
    expect(r.quer_marketing).toBe(false);
    expect(r.whatsapp_contato).toBeNull();
    expect(r.tempo_negocio).toBeUndefined();
  });

  it("guarda as respostas escolhidas", () => {
    const r = esquemaPerfil.parse({ ...vazio, tempo_negocio: "3_a_5", equipe: "so_eu", faturamento: "nao_informar", origem: "instagram", quer_marketing: "nao" });
    expect(r).toMatchObject({ tempo_negocio: "3_a_5", equipe: "so_eu", faturamento: "nao_informar", origem: "instagram", quer_marketing: false });
  });

  it("recusa resposta que não está na lista", () => {
    const r = esquemaPerfil.safeParse({ ...vazio, faturamento: "um_milhao" });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].path[0]).toBe("faturamento");
  });

  it("pedido de marketing exige WhatsApp válido e guarda só os números", () => {
    const sem = esquemaPerfil.safeParse({ ...vazio, quer_marketing: "sim" });
    expect(sem.success).toBe(false);
    expect(sem.error!.issues[0].path[0]).toBe("whatsapp_contato");
    const com = esquemaPerfil.parse({ ...vazio, quer_marketing: "sim", whatsapp_contato: "(43) 99999-0000" });
    expect(com).toMatchObject({ quer_marketing: true, whatsapp_contato: "5543999990000" });
  });

  it("sem pedido de marketing, o WhatsApp digitado é descartado", () => {
    expect(esquemaPerfil.parse({ ...vazio, quer_marketing: "nao", whatsapp_contato: "(43) 99999-0000" }).whatsapp_contato).toBeNull();
  });

  it("cada campo sabe em qual tela aparece", () => {
    expect(ETAPA_DO_CAMPO).toMatchObject({ nome: 0, nicho: 1, equipe: 2, origem: 3, whatsapp_contato: 3 });
    expect(Math.max(...Object.values(ETAPA_DO_CAMPO))).toBe(TOTAL_ETAPAS - 1);
  });
});
