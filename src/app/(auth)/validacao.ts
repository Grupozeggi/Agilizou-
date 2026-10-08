import { z } from "zod";

/** Regras de validação dos formulários de acesso (usadas no servidor). */

const email = z.string().trim().toLowerCase().pipe(z.email({ error: "Digite um e-mail válido." }));

const senha = z
  .string()
  .min(8, { error: "A senha precisa ter pelo menos 8 caracteres." })
  .max(72, { error: "A senha pode ter no máximo 72 caracteres." })
  .regex(/[A-Za-z]/, { error: "A senha precisa ter pelo menos uma letra." })
  .regex(/\d/, { error: "A senha precisa ter pelo menos um número." });

export const esquemaCadastro = z.object({
  nome: z.string().trim().min(2, { error: "Digite seu nome." }).max(120),
  nome_empresa: z.string().trim().min(2, { error: "Digite o nome do seu negócio." }).max(120),
  email,
  senha,
  aceite: z.literal("on", { error: "Para continuar, aceite os Termos de Uso e a Política de Privacidade." }),
});

export const esquemaEntrar = z.object({
  email,
  senha: z.string().min(1, { error: "Digite sua senha." }),
});

export const esquemaRecuperar = z.object({ email });

export const esquemaRedefinir = z
  .object({ senha, confirmacao: z.string() })
  .refine((d) => d.senha === d.confirmacao, { error: "As senhas não são iguais.", path: ["confirmacao"] });

export type EstadoForm = {
  erro?: string;
  sucesso?: string;
  erros?: Record<string, string>;
  valores?: Record<string, string>;
};

/** Primeira mensagem de erro de cada campo. */
export function errosPorCampo(erro: z.ZodError): Record<string, string> {
  const r: Record<string, string> = {};
  for (const issue of erro.issues) {
    const campo = String(issue.path[0] ?? "form");
    r[campo] ??= issue.message;
  }
  return r;
}
