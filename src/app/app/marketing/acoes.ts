"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errosPorCampo, type EstadoForm } from "@/lib/formulario";
import { normalizarWhatsapp } from "@/lib/mensagens";
import { exigirCliente } from "@/lib/sessao";

const esquema = z.object({
  whatsapp_contato: z.string({ error: "Digite o seu WhatsApp." }).transform((v, ctx) => {
    const n = normalizarWhatsapp(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "WhatsApp inválido. Use DDD + número, ex.: (11) 99999-8888." });
      return z.NEVER;
    }
    return n;
  }),
});

/**
 * Pede o contato do time de marketing. Funciona mesmo com a conta em
 * somente leitura (não é um lançamento, é um pedido de contato).
 */
export async function pedirMarketing(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const r = esquema.safeParse({ whatsapp_contato: form.get("whatsapp_contato") ?? undefined });
  if (!r.success) return { erros: errosPorCampo(r.error) };
  const { supabase, empresa } = await exigirCliente();
  const { error } = await supabase
    .from("perfil_negocio")
    .upsert({ empresa_id: empresa.id, quer_marketing: true, whatsapp_contato: r.data.whatsapp_contato }, { onConflict: "empresa_id" });
  if (error) {
    console.error("[marketing] pedido", error);
    return { erro: "Não foi possível enviar o pedido. Tente de novo." };
  }
  revalidatePath("/app/marketing");
  return { sucesso: "Pedido enviado." };
}

/** Desiste do pedido de contato. */
export async function cancelarPedidoMarketing(): Promise<void> {
  const { supabase, empresa } = await exigirCliente();
  const { error } = await supabase.from("perfil_negocio").update({ quer_marketing: false }).eq("empresa_id", empresa.id);
  if (error) console.error("[marketing] cancelar", error);
  revalidatePath("/app/marketing");
}
