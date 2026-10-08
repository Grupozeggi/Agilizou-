import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, MessageCircle } from "lucide-react";
import { Aviso, Cartao } from "@/components/ui";
import { limitesDaEmpresa, situacaoLimite } from "@/config/planos";
import { partesSp } from "@/lib/agenda";
import { formatarData, hojeIso } from "@/lib/datas";
import { formatarReais, somar } from "@/lib/dinheiro";
import { lerRegua, NOMES_ETAPA, type Etapa } from "@/lib/regua";
import { exigirCliente } from "@/lib/sessao";
import { FormRegua } from "./form-regua";

export const metadata: Metadata = { title: "Mensagens automáticas" };

const STATUS: Record<string, string> = {
  pendente: "Na fila",
  enviando: "Enviando",
  enviada: "Enviada",
  entregue: "Entregue",
  lida: "Lida",
  falhou: "Falhou",
  cancelada: "Cancelada",
};

export default async function Mensagens() {
  const { supabase, empresa } = await exigirCliente();
  const limite = limitesDaEmpresa(empresa.plano, empresa.limites_personalizados).mensagensWhatsappPorMes;
  const inicioMes = new Date(`${hojeIso().slice(0, 7)}-01T00:00:00-03:00`).toISOString();

  const [{ data: config }, { data: doMes }, { data: recentes }] = await Promise.all([
    supabase.from("empresas").select("whatsapp_ativo, regua_whatsapp").eq("id", empresa.id).single(),
    supabase.from("mensagens_whatsapp").select("status, custo_estimado_centavos").gte("enviado_em", inicioMes),
    supabase
      .from("mensagens_whatsapp")
      .select("id, etapa, status, agendado_para, erro, cliente:clientes(nome)")
      .order("agendado_para", { ascending: false })
      .limit(30)
      .returns<{ id: string; etapa: Etapa; status: string; agendado_para: string; erro: string | null; cliente: { nome: string } | null }[]>(),
  ]);

  const enviadas = (doMes ?? []).filter((m) => ["enviada", "entregue", "lida"].includes(m.status));
  const entregues = enviadas.filter((m) => m.status !== "enviada").length;
  const falhas = (doMes ?? []).filter((m) => m.status === "falhou").length;
  const custo = somar(enviadas.map((m) => m.custo_estimado_centavos));
  const situacao = situacaoLimite(enviadas.length, limite);

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-2xl">
        <MessageCircle className="size-6 text-entrada" strokeWidth={1.75} /> Mensagens automáticas
      </h1>
      <p className="text-sm text-suave">
        Lembretes de horário pelo WhatsApp. O cliente responde 1 para confirmar, 2 para remarcar ou 3 para cancelar, e a agenda atualiza sozinha.
      </p>

      {limite <= 0 ? (
        <Cartao className="space-y-2 ring-1 ring-dourado/60">
          <p className="flex items-center gap-2 font-semibold text-tinta">
            <BadgeCheck className="size-5 text-dourado" /> Disponível no plano Profissional
          </p>
          <p className="text-sm text-suave">No plano Essencial você cobra e lembra os clientes pelo botão de WhatsApp, manualmente.</p>
          <Link href="/app/assinatura" className="inline-block font-semibold text-royal-vivo underline">
            Conhecer o Profissional
          </Link>
        </Cartao>
      ) : (
        <>
          {situacao !== "ok" && (
            <Aviso tipo={situacao === "bloqueado" ? "erro" : "info"}>
              {situacao === "bloqueado"
                ? `Limite de ${limite} mensagens do mês atingido. As próximas ficam paradas até o mês virar ou até o upgrade.`
                : `Você já usou ${enviadas.length} de ${limite} mensagens deste mês.`}
            </Aviso>
          )}
          <div className="grid grid-cols-2 gap-2">
            {[
              ["Enviadas no mês", `${enviadas.length} de ${limite}`],
              ["Entregues ou lidas", String(entregues)],
              ["Falharam", String(falhas)],
              ["Custo estimado", formatarReais(custo)],
            ].map(([r, v]) => (
              <Cartao key={r} className="p-4">
                <p className="text-xs text-suave">{r}</p>
                <p className="numero mt-1 text-lg font-semibold text-tinta">{v}</p>
              </Cartao>
            ))}
          </div>
        </>
      )}

      <FormRegua ativo={config?.whatsapp_ativo ?? false} regua={lerRegua(config?.regua_whatsapp)} empresa={empresa.nome} bloqueado={limite <= 0} />

      {recentes && recentes.length > 0 && (
        <Cartao className="p-4">
          <h2 className="text-base">Últimas mensagens</h2>
          <ul className="mt-2 divide-y divide-borda text-sm">
            {recentes.map((m) => {
              const p = partesSp(m.agendado_para);
              return (
                <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-tinta">{m.cliente?.nome ?? "—"}</span>
                    <span className="block truncate text-xs text-suave">
                      {NOMES_ETAPA[m.etapa] ?? m.etapa} · {formatarData(p.data).slice(0, 5)} {p.hora}
                      {m.erro && m.status !== "enviada" ? ` · ${m.erro}` : ""}
                    </span>
                  </span>
                  <span className={`shrink-0 text-xs font-semibold ${m.status === "falhou" ? "text-saida" : ["entregue", "lida"].includes(m.status) ? "text-entrada" : "text-suave"}`}>
                    {STATUS[m.status] ?? m.status}
                  </span>
                </li>
              );
            })}
          </ul>
        </Cartao>
      )}
    </div>
  );
}
