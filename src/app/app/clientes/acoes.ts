"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { errosPorCampo, type EstadoForm } from "@/lib/formulario";
import { usoCadastro } from "@/lib/limites";
import { normalizarWhatsapp } from "@/lib/mensagens";
import { exigirCliente } from "@/lib/sessao";
import { dadosDoForm } from "../lancamentos/validacao";

const vazio = (v: unknown) => (v === "" || v === null ? undefined : v);

const esquema = z.object({
  id: z.preprocess(vazio, z.uuid().optional()),
  nome: z.string({ error: "Digite o nome." }).trim().min(1, { error: "Digite o nome." }).max(120),
  whatsapp: z.preprocess(
    vazio,
    z
      .string()
      .transform((v, ctx) => {
        const n = normalizarWhatsapp(v);
        if (!n) {
          ctx.addIssue({ code: "custom", message: "WhatsApp inválido. Use DDD + número, ex.: (11) 99999-8888." });
          return z.NEVER;
        }
        return n;
      })
      .optional(),
  ),
  observacoes: z.preprocess(vazio, z.string().trim().max(1000).optional()),
  aceita_mensagens: z.preprocess((v) => v === "on", z.boolean()),
});

export async function salvarCliente(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const r = esquema.safeParse(dadosDoForm(form));
  if (!r.success) return { erros: errosPorCampo(r.error) };
  const { id, ...d } = r.data;
  const { supabase, empresa } = await exigirCliente();
  const dados = { nome: d.nome, whatsapp: d.whatsapp ?? null, observacoes: d.observacoes ?? null, aceita_mensagens: d.aceita_mensagens };

  let novoId = id;
  if (id) {
    const { error } = await supabase.from("clientes").update(dados).eq("id", id).is("deleted_at", null);
    if (error) return { erro: "Não foi possível salvar." };
  } else {
    const uso = await usoCadastro(supabase, empresa, "clientes");
    if (uso.situacao === "bloqueado") return { erro: uso.mensagem, limiteAtingido: true };
    const { data, error } = await supabase.from("clientes").insert(dados).select("id").single();
    if (error) return { erro: "Não foi possível salvar." };
    novoId = data.id;
  }
  revalidatePath("/app/clientes", "layout");
  const voltar = String(form.get("voltar") ?? "");
  redirect(voltar.startsWith("/app/") ? voltar.replace("{id}", novoId!) : `/app/clientes/${novoId}`);
}

export async function excluirCliente(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const id = String(form.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) return { erro: "Cliente inválido." };
  const { supabase } = await exigirCliente();
  const { error } = await supabase.from("clientes").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { erro: "Não foi possível excluir." };
  revalidatePath("/app/clientes", "layout");
  redirect("/app/clientes");
}
