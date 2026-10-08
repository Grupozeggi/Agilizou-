import { NextResponse, type NextRequest } from "next/server";
import { limitesDaEmpresa } from "@/config/planos";
import { centavosCsv, gerarCsv } from "@/lib/csv";
import { hojeIso } from "@/lib/datas";
import { gerarPdf } from "@/lib/pdf";
import { exigirCliente } from "@/lib/sessao";
import { carregarRelatorios, celulaTexto, periodoTexto, RELATORIOS, type Celula, type TipoRelatorio } from "../dados";
import { periodoDosParametros } from "../periodo";

/**
 * Exporta um relatório em CSV ou PDF (ou "completo", todos em um PDF).
 * Conta no limite de exportações do plano antes de gerar.
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const formato = p.get("f") === "pdf" ? "pdf" : "csv";
  const tipo = p.get("r") ?? "";
  const completo = tipo === "completo";
  if (!completo && !(tipo in RELATORIOS)) return NextResponse.json({ erro: "Relatório inválido." }, { status: 400 });
  if (completo && formato !== "pdf") return NextResponse.json({ erro: "O relatório completo é só em PDF." }, { status: 400 });

  const { supabase, empresa } = await exigirCliente();
  const voltar = new URL(`/app/relatorios?${p.toString()}`, request.url);

  // Limite do plano (Essencial: 1 por mês).
  const limite = limitesDaEmpresa(empresa.plano, empresa.limites_personalizados).exportacoesPorMes;
  if (limite !== Infinity) {
    const inicioMes = new Date(`${hojeIso().slice(0, 7)}-01T00:00:00-03:00`).toISOString();
    const { count } = await supabase.from("exportacoes").select("id", { count: "exact", head: true }).gte("criado_em", inicioMes);
    if ((count ?? 0) >= limite) {
      voltar.searchParams.set("erro", "limite");
      return NextResponse.redirect(voltar);
    }
  }

  const { inicio, fim } = periodoDosParametros(Object.fromEntries(p.entries()));
  const { relatorios } = await carregarRelatorios(supabase, inicio, fim);
  const escolhidos = completo ? Object.values(relatorios) : [relatorios[tipo as TipoRelatorio]];

  const { error } = await supabase.from("exportacoes").insert({ relatorio: tipo, formato });
  if (error) return NextResponse.json({ erro: "Não foi possível exportar agora." }, { status: 500 });

  const nome = `agilizou-${tipo}-${inicio}_${fim}.${formato}`;
  if (formato === "csv") {
    const r = escolhidos[0];
    const csv = (c: Celula) => (typeof c === "string" ? c : "c" in c ? centavosCsv(c.c) : "q" in c ? String(c.q).replace(".", ",") : c.p === null ? "" : String(c.p).replace(".", ","));
    const corpo = gerarCsv(r.colunas.map((c) => c.rotulo), [...r.linhas, ...(r.total ? [r.total] : [])].map((l) => l.map(csv)));
    return new Response(corpo, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nome}"` } });
  }

  const pdf = gerarPdf({
    titulo: completo ? "Relatório completo" : escolhidos[0].titulo,
    subtitulo: `${empresa.nome} · ${periodoTexto(inicio, fim)} · gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
    secoes: escolhidos.map((r) => ({
      titulo: r.titulo,
      colunas: r.colunas,
      linhas: r.linhas.map((l) => l.map(celulaTexto)),
      total: r.total?.map(celulaTexto),
    })),
  });
  return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nome}"` } });
}
