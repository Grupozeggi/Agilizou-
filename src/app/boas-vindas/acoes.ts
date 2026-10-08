"use server";

import { redirect } from "next/navigation";
import { NICHOS } from "@/config/nichos";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { errosPorCampo, type EstadoForm } from "@/lib/formulario";
import { esquemaOnboarding } from "./validacao";

export async function concluirOnboarding(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const r = esquemaOnboarding.safeParse({
    nome: form.get("nome") ?? undefined,
    nicho: form.get("nicho") ?? undefined,
    saldo: form.get("saldo") ?? undefined,
  });
  if (!r.success) return { erros: errosPorCampo(r.error) };

  const nicho = NICHOS[r.data.nicho];
  const supabase = await criarClienteServidor();
  // Uma única chamada: atualiza a empresa e cria as categorias juntas
  // (se algo falhar, nada fica pela metade).
  const { error } = await supabase.rpc("concluir_onboarding", {
    p_nome: r.data.nome,
    p_nicho: nicho.id,
    p_saldo_inicial_centavos: r.data.saldo,
    p_agenda_ativa: nicho.agendaAtiva,
    p_categorias: nicho.categorias,
  });
  if (error) {
    console.error("[onboarding]", error);
    return { erro: "Não foi possível salvar agora. Tente de novo em instantes." };
  }

  redirect("/app");
}
