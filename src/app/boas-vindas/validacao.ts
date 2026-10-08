import { z } from "zod";
import { nichoValido, type NichoId } from "@/config/nichos";
import { paraCentavos } from "@/lib/dinheiro";

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

/** Em qual tela do onboarding cada campo aparece. */
export const ETAPA_DO_CAMPO: Record<string, number> = { nome: 0, nicho: 1, saldo: 2 };
