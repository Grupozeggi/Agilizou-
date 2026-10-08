"use server";

import { redirect } from "next/navigation";
import { NICHOS } from "@/config/nichos";
import { PERGUNTAS } from "@/config/perfil-negocio";
import { exigirCliente } from "@/lib/sessao";
import { errosPorCampo, type EstadoForm } from "@/lib/formulario";
import { esquemaOnboarding, esquemaPerfil } from "./validacao";

export async function concluirOnboarding(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const r = esquemaOnboarding.safeParse({
    nome: form.get("nome") ?? undefined,
    nicho: form.get("nicho") ?? undefined,
    // O caixa começa zerado: o saldo inicial não é mais perguntado no cadastro.
    saldo: form.get("saldo") ?? "0,00",
  });
  const perfil = esquemaPerfil.safeParse({
    ...Object.fromEntries(PERGUNTAS.map((p) => [p.campo, form.get(p.campo)])),
    quer_marketing: form.get("quer_marketing"),
    whatsapp_contato: form.get("whatsapp_contato"),
  });
  if (!r.success || !perfil.success) {
    return { erros: { ...(perfil.success ? {} : errosPorCampo(perfil.error)), ...(r.success ? {} : errosPorCampo(r.error)) } };
  }

  const nicho = NICHOS[r.data.nicho];
  const { supabase, empresa } = await exigirCliente();

  // Respostas sobre o negócio: gravadas antes de concluir. Se falhar, o
  // cadastro segue (as perguntas são opcionais); só fica registrado no log.
  const respostas = perfil.data;
  const respondeu = respostas.quer_marketing || PERGUNTAS.some((p) => respostas[p.campo]);
  if (respondeu) {
    const { error: erroPerfil } = await supabase.from("perfil_negocio").upsert(
      {
        empresa_id: empresa.id,
        ...Object.fromEntries(PERGUNTAS.map((p) => [p.campo, respostas[p.campo] ?? null])),
        quer_marketing: respostas.quer_marketing,
        whatsapp_contato: respostas.whatsapp_contato,
      },
      { onConflict: "empresa_id" },
    );
    if (erroPerfil) console.error("[onboarding] perfil do negócio", erroPerfil);
  }

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
