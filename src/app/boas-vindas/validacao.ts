import { z } from "zod";
import { nichoValido, type NichoId } from "@/config/nichos";
import { TELA_DA_PERGUNTA, valoresDe, type CampoPerfil } from "@/config/perfil-negocio";
import { paraCentavos } from "@/lib/dinheiro";
import { normalizarWhatsapp } from "@/lib/mensagens";

/** Limite de sanidade para o saldo inicial: R$ 10 bilhões. */
const SALDO_MAXIMO = 1_000_000_000_000;

export const esquemaOnboarding = z.object({
  nome: z
    .string({ error: "Digite o nome do seu negócio." })
    .trim()
    .min(2, { error: "Digite o nome do seu negócio." })
    .max(120, { error: "Use no máximo 120 caracteres." }),
  nicho: z
    .string({ error: "Escolha o tipo do seu negócio." })
    .refine(nichoValido, { error: "Escolha o tipo do seu negócio." })
    .transform((v) => v as NichoId),
  saldo: z
    .string({ error: "Digite o saldo do caixa hoje." })
    .transform((v, ctx) => {
      const centavos = paraCentavos(v);
      if (centavos === null || Math.abs(centavos) > SALDO_MAXIMO) {
        ctx.addIssue({ code: "custom", message: "Digite um valor válido, por exemplo 1.500,00." });
        return z.NEVER;
      }
      return centavos;
    }),
});

const vazio = (v: unknown) => (v === "" || v === null ? undefined : v);
const resposta = (campo: CampoPerfil) =>
  z.preprocess(vazio, z.enum(valoresDe(campo) as [string, ...string[]], { error: "Escolha uma das opções." }).optional());

/**
 * Perguntas sobre o negócio (telas 3 e 4). Todas opcionais: quem pular
 * continua o cadastro normalmente. O WhatsApp só é exigido de quem pede o
 * contato do time de marketing.
 */
export const esquemaPerfil = z
  .object({
    tempo_negocio: resposta("tempo_negocio"),
    equipe: resposta("equipe"),
    faturamento: resposta("faturamento"),
    controle_caixa: resposta("controle_caixa"),
    dificuldade: resposta("dificuldade"),
    origem: resposta("origem"),
    quer_marketing: z.preprocess((v) => v === "sim", z.boolean()),
    whatsapp_contato: z.preprocess(vazio, z.string().optional()),
  })
  .transform((d, ctx) => {
    if (!d.quer_marketing) return { ...d, whatsapp_contato: null };
    const numero = normalizarWhatsapp(d.whatsapp_contato);
    if (!numero) {
      ctx.addIssue({ code: "custom", path: ["whatsapp_contato"], message: "Digite o WhatsApp com DDD para o nosso time falar com você." });
      return z.NEVER;
    }
    return { ...d, whatsapp_contato: numero };
  });

/**
 * Em qual tela do onboarding cada campo aparece. O saldo inicial não é mais
 * perguntado (o caixa começa zerado); se vier inválido, volta para o começo.
 */
export const ETAPA_DO_CAMPO: Record<string, number> = {
  nome: 0,
  nicho: 1,
  saldo: 0,
  ...TELA_DA_PERGUNTA,
  quer_marketing: 3,
  whatsapp_contato: 3,
};

/** Total de telas do onboarding. */
export const TOTAL_ETAPAS = 4;
