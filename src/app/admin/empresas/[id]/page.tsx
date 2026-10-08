import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Cartao } from "@/components/ui";
import { NICHOS, type NichoId } from "@/config/nichos";
import { PERGUNTAS, rotuloDaResposta } from "@/config/perfil-negocio";
import { limitesDaEmpresa, PLANOS, type Limites, type PlanoId } from "@/config/planos";
import { partesSp } from "@/lib/agenda";
import { dataSp, formatarData } from "@/lib/datas";
import { formatarReais } from "@/lib/dinheiro";
import { formatarQuantidade } from "@/lib/estoque";
import { formatarWhatsapp } from "@/lib/mensagens";
import { exigirAdmin } from "@/lib/sessao";
import { AcoesConta, BotaoRestaurar, BotaoSenha, BotaoSuporte, FormLimites } from "./componentes";

export const metadata: Metadata = { title: "Empresa" };

export default async function DetalheEmpresa({ params }: PageProps<"/admin/empresas/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase } = await exigirAdmin();

  const [{ data: e }, { data: perfis }, { data: lancamentos }, { data: excluidos }, { data: produtos }, { data: vendas }, { data: agenda }, { data: clientes }, { data: logs }, { data: negocio }] =
    await Promise.all([
      supabase.from("empresas").select("*").eq("id", id).maybeSingle(),
      supabase.from("perfis").select("nome, email, criado_em").eq("empresa_id", id),
      supabase.from("lancamentos").select("id, tipo, valor_centavos, data, status, descricao").eq("empresa_id", id).is("deleted_at", null).order("data", { ascending: false }).limit(15),
      supabase.from("lancamentos").select("id, tipo, valor_centavos, data, descricao, deleted_at").eq("empresa_id", id).not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(20),
      supabase.from("produtos").select("id, codigo, nome, estoque, unidade, preco_centavos").eq("empresa_id", id).is("deleted_at", null).order("nome").limit(15),
      supabase.from("vendas").select("id, numero, data, total_centavos, custo_total_centavos").eq("empresa_id", id).is("deleted_at", null).order("data", { ascending: false }).limit(10),
      supabase.from("agendamentos").select("id, inicio, status, cliente:clientes(nome)").eq("empresa_id", id).is("deleted_at", null).order("inicio", { ascending: false }).limit(10),
      supabase.from("clientes").select("id, nome, whatsapp").eq("empresa_id", id).is("deleted_at", null).order("nome").limit(15),
      supabase.from("log_admin").select("id, criado_em, admin_email, acao, tabela, modo_suporte").eq("empresa_id", id).order("criado_em", { ascending: false }).limit(20),
      supabase
        .from("perfil_negocio")
        .select("tempo_negocio, equipe, faturamento, controle_caixa, dificuldade, origem, quer_marketing, whatsapp_contato, marketing_pedido_em")
        .eq("empresa_id", id)
        .maybeSingle(),
    ]);
  if (!e) notFound();
  const limites = limitesDaEmpresa(e.plano as PlanoId, e.limites_personalizados as Partial<Limites> | null);

  return (
    <div className="space-y-4">
      <Link href="/admin/empresas" className="text-sm font-medium text-royal-vivo">
        ← Empresas
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">{e.nome}</h1>
          <p className="text-sm text-suave">
            {NICHOS[e.nicho as NichoId]?.nome} · {PLANOS[e.plano as PlanoId].nome} · {e.status_assinatura}
            {e.status_assinatura === "teste" && ` até ${formatarData(dataSp(e.teste_ate))}`} · cadastro {formatarData(dataSp(e.criado_em))}
          </p>
          <p className="text-sm text-suave">{(perfis ?? []).map((p) => `${p.nome ?? ""} <${p.email}>`).join(", ")}</p>
          {e.proxima_cobranca && <p className="text-sm text-suave">Próxima cobrança: {formatarData(e.proxima_cobranca)}</p>}
          {e.slug && (
            <p className="text-sm text-suave">
              Link de agendamento:{" "}
              {e.agendamento_online ? (
                <Link href={`/agendar/${e.slug}`} target="_blank" className="font-medium text-royal-vivo underline">
                  /agendar/{e.slug}
                </Link>
              ) : (
                `desligado (/agendar/${e.slug})`
              )}
            </p>
          )}
        </div>
        <BotaoSuporte empresa={e.id} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao className="space-y-3 p-4">
          <h2 className="text-base">Conta</h2>
          <AcoesConta empresa={e.id} plano={e.plano} />
          <BotaoSenha empresa={e.id} />
        </Cartao>
        <Cartao className="p-4">
          <h2 className="text-base">Limites desta empresa</h2>
          <p className="mb-3 text-xs text-suave">Em branco = limite do plano.</p>
          <FormLimites empresa={e.id} personalizados={(e.limites_personalizados as Partial<Limites>) ?? {}} doPlano={limitesDaEmpresa(e.plano as PlanoId)} />
          <p className="mt-2 text-xs text-suave">
            Em vigor: {limites.lancamentosPorMes} lanç./mês · {limites.produtos} produtos · {limites.clientes} clientes · {limites.profissionais} profissionais
          </p>
        </Cartao>
      </div>

      <Cartao className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base">Perfil do negócio (respostas do cadastro)</h2>
          {negocio?.quer_marketing && (
            <span className="rounded-full bg-dourado/15 px-3 py-1 text-xs font-semibold text-royal-escuro">
              Pediu contato de marketing{negocio.marketing_pedido_em ? ` em ${formatarData(dataSp(negocio.marketing_pedido_em))}` : ""}
              {negocio.whatsapp_contato ? ` · ${formatarWhatsapp(negocio.whatsapp_contato)}` : ""}
            </span>
          )}
        </div>
        {negocio ? (
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {PERGUNTAS.map((p) => (
              <div key={p.campo}>
                <dt className="text-xs text-suave">{p.resumo}</dt>
                <dd className="text-texto">{rotuloDaResposta(p.campo, negocio[p.campo]) ?? "Não respondeu"}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-2 text-sm text-suave">Não respondeu às perguntas do cadastro.</p>
        )}
      </Cartao>

      <div className="grid gap-4 lg:grid-cols-2">
        <Lista titulo="Últimos lançamentos" vazio={!lancamentos?.length}>
          {lancamentos?.map((l) => (
            <li key={l.id} className="flex justify-between py-1.5">
              <span>
                {formatarData(l.data)} · {l.descricao ?? l.tipo} {l.status === "pendente" && <span className="text-xs text-suave">(pendente)</span>}
              </span>
              <span className={`numero ${l.tipo === "entrada" ? "text-entrada" : "text-saida"}`}>{formatarReais(l.valor_centavos)}</span>
            </li>
          ))}
        </Lista>
        <Lista titulo="Lançamentos excluídos (restaurar)" vazio={!excluidos?.length}>
          {excluidos?.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 py-1.5">
              <span>
                {formatarData(l.data)} · {l.descricao ?? l.tipo} · <span className="numero">{formatarReais(l.valor_centavos)}</span>
                <span className="block text-xs text-suave">excluído em {formatarData(dataSp(l.deleted_at!))}</span>
              </span>
              <BotaoRestaurar lancamento={l.id} empresa={e.id} />
            </li>
          ))}
        </Lista>
        <Lista titulo="Produtos" vazio={!produtos?.length}>
          {produtos?.map((p) => (
            <li key={p.id} className="flex justify-between py-1.5">
              <span>
                #{String(p.codigo).padStart(4, "0")} {p.nome}
              </span>
              <span className="numero">
                {formatarQuantidade(Number(p.estoque), p.unidade)} · {formatarReais(p.preco_centavos)}
              </span>
            </li>
          ))}
        </Lista>
        <Lista titulo="Vendas" vazio={!vendas?.length}>
          {vendas?.map((v) => (
            <li key={v.id} className="flex justify-between py-1.5">
              <span>
                #{v.numero} · {formatarData(v.data)}
              </span>
              <span className="numero">
                {formatarReais(v.total_centavos)} <span className="text-xs text-suave">lucro {formatarReais(v.total_centavos - v.custo_total_centavos)}</span>
              </span>
            </li>
          ))}
        </Lista>
        <Lista titulo="Agenda" vazio={!agenda?.length}>
          {agenda?.map((a) => {
            const p = partesSp(a.inicio);
            return (
              <li key={a.id} className="flex justify-between py-1.5">
                <span>
                  {formatarData(p.data)} {p.hora} · {(a.cliente as unknown as { nome: string } | null)?.nome}
                </span>
                <span className="text-xs text-suave">{a.status}</span>
              </li>
            );
          })}
        </Lista>
        <Lista titulo="Clientes" vazio={!clientes?.length}>
          {clientes?.map((c) => (
            <li key={c.id} className="flex justify-between py-1.5">
              <span>{c.nome}</span>
              <span className="text-xs text-suave">{c.whatsapp ?? "—"}</span>
            </li>
          ))}
        </Lista>
      </div>

      <Lista titulo="Ações do suporte nesta empresa" vazio={!logs?.length}>
        {logs?.map((l) => (
          <li key={l.id} className="flex justify-between gap-2 py-1.5">
            <span>
              {new Date(l.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {l.admin_email} · {l.acao}
              {l.tabela ? ` em ${l.tabela}` : ""}
            </span>
            {l.modo_suporte && <span className="text-xs font-semibold text-dourado">modo suporte</span>}
          </li>
        ))}
      </Lista>
    </div>
  );
}

function Lista({ titulo, vazio, children }: { titulo: string; vazio?: boolean; children: React.ReactNode }) {
  return (
    <Cartao className="p-4">
      <h2 className="text-base">{titulo}</h2>
      {vazio ? <p className="mt-2 text-sm text-suave">Nada por aqui.</p> : <ul className="mt-2 divide-y divide-borda text-sm">{children}</ul>}
    </Cartao>
  );
}
