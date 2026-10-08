import { NextResponse } from "next/server";
import { datasDeAviso, escaparHtml, montarAviso, type ItemAviso } from "@/lib/avisos";
import { cronAutorizado } from "@/lib/cron";
import { hojeIso, somarDias } from "@/lib/datas";
import { enviarEmail } from "@/lib/email";
import { urlDoSite } from "@/lib/env";
import { enviarPush } from "@/lib/push";
import { criarClienteServico } from "@/lib/supabase/servico";

/**
 * Roda todo dia às 8h (Brasília). Para cada empresa, junta as contas e
 * lembretes que vencem hoje e/ou daqui a N dias (preferência da empresa) e
 * manda um e-mail de resumo e uma notificação para cada aparelho inscrito.
 * Cada aviso é registrado em avisos_enviados para nunca sair repetido.
 */
export async function GET(request: Request) {
  if (!cronAutorizado(request)) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const db = criarClienteServico();
  const hoje = hojeIso();
  const ate = somarDias(hoje, 7);

  const [{ data: empresas }, { data: contas }, { data: lembretes }, { data: perfis }, { data: inscricoes }] = await Promise.all([
    db
      .from("empresas")
      .select("id, nome, aviso_email, aviso_push, aviso_no_dia, aviso_dias_antes")
      .in("status_assinatura", ["teste", "ativo", "inadimplente"]),
    db
      .from("lancamentos")
      .select("empresa_id, tipo, descricao, valor_centavos, data, categoria:categorias(nome)")
      .is("deleted_at", null)
      .eq("status", "pendente")
      .gte("data", hoje)
      .lte("data", ate)
      .returns<{ empresa_id: string; tipo: string; descricao: string | null; valor_centavos: number; data: string; categoria: { nome: string } | null }[]>(),
    db.from("lembretes").select("empresa_id, titulo, valor_centavos, data").is("deleted_at", null).eq("feito", false).gte("data", hoje).lte("data", ate),
    db.from("perfis").select("empresa_id, email"),
    db.from("notificacoes_push").select("id, empresa_id, endpoint, p256dh, auth"),
  ]);

  const resultado = { empresas: 0, emails: 0, pushes: 0 };
  for (const e of empresas ?? []) {
    const datas = datasDeAviso(hoje, e);
    if (!datas.length) continue;
    const itens: ItemAviso[] = [
      ...(contas ?? [])
        .filter((c) => c.empresa_id === e.id && datas.includes(c.data))
        .map((c) => ({
          tipo: (c.tipo === "saida" ? "pagar" : "receber") as ItemAviso["tipo"],
          titulo: c.descricao || c.categoria?.nome || "Conta",
          data: c.data,
          valor_centavos: c.valor_centavos,
        })),
      ...(lembretes ?? [])
        .filter((l) => l.empresa_id === e.id && datas.includes(l.data))
        .map((l) => ({ tipo: "lembrete" as const, titulo: l.titulo, data: l.data, valor_centavos: l.valor_centavos })),
    ];
    if (!itens.length) continue;
    resultado.empresas++;
    const aviso = montarAviso(itens, hoje, e.nome);
    const url = `${urlDoSite()}/app/hoje`;

    if (e.aviso_email && (await registrar(db, e.id, `${e.id}:${hoje}`, "email"))) {
      const para = (perfis ?? []).filter((p) => p.empresa_id === e.id).map((p) => p.email);
      if (para.length) {
        const r = await enviarEmail({
          para,
          assunto: aviso.titulo,
          texto: `${aviso.linhas.join("\n")}\n\nAbrir o Agilizou: ${url}`,
          html: `<div style="font-family:Arial,sans-serif;color:#1f2a44;max-width:480px">
            <h2 style="color:#0B2A6F">${escaparHtml(aviso.titulo)}</h2>
            <ul>${aviso.linhas.map((l) => `<li style="margin:6px 0">${escaparHtml(l)}</li>`).join("")}</ul>
            <p><a href="${url}" style="background:#2F5BEA;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none">Abrir o Agilizou</a></p>
            <p style="color:#5b6785;font-size:12px">Você pode mudar estes avisos em Ajustes → Avisos.</p></div>`,
        });
        if (r.ok) resultado.emails++;
        else console.error("[cron avisos] e-mail", e.id, r.erro);
      }
    }

    if (e.aviso_push && (await registrar(db, e.id, `${e.id}:${hoje}`, "push"))) {
      for (const i of (inscricoes ?? []).filter((x) => x.empresa_id === e.id)) {
        const r = await enviarPush(i, { titulo: aviso.titulo, corpo: aviso.resumo, url: "/app/hoje" });
        if (r === "enviada" || r === "simulado") resultado.pushes++;
        if (r === "expirada") await db.from("notificacoes_push").delete().eq("id", i.id);
      }
    }
  }
  return NextResponse.json(resultado);
}

/** Marca o aviso como enviado. false = já tinha sido mandado hoje. */
async function registrar(db: ReturnType<typeof criarClienteServico>, empresa: string, chave: string, canal: "email" | "push") {
  const { data, error } = await db
    .from("avisos_enviados")
    .upsert({ empresa_id: empresa, chave, canal }, { onConflict: "chave,canal", ignoreDuplicates: true })
    .select("id");
  if (error) {
    console.error("[cron avisos] registro", error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}
