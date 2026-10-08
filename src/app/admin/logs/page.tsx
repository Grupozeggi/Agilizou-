import type { Metadata } from "next";
import Link from "next/link";
import { Cartao } from "@/components/ui";
import { exigirAdmin } from "@/lib/sessao";

export const metadata: Metadata = { title: "Auditoria" };

const quando = (t: string) => new Date(t).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default async function Logs() {
  const { supabase } = await exigirAdmin();
  const [{ data: acoes }, { data: negados }] = await Promise.all([
    supabase.from("log_admin").select("id, criado_em, admin_email, empresa_id, acao, tabela, registro_id, modo_suporte, valor_anterior, valor_novo").order("criado_em", { ascending: false }).limit(100),
    supabase.from("log_acesso_negado").select("id, criado_em, email, rota, motivo, ip").order("criado_em", { ascending: false }).limit(50),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl">Auditoria</h1>
      <p className="text-sm text-suave">Registro imutável: ninguém edita nem apaga estes logs.</p>
      <Cartao className="overflow-x-auto p-0">
        <h2 className="px-4 pt-4 text-base">Ações dos administradores</h2>
        <table className="mt-2 w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-borda text-xs text-suave">
            <tr>
              {["Quando", "Quem", "Empresa", "O quê", "Antes → depois"].map((h) => (
                <th key={h} className="px-4 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-borda align-top">
            {(acoes ?? []).map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap px-4 py-2">{quando(l.criado_em)}</td>
                <td className="px-4 py-2">{l.admin_email}</td>
                <td className="px-4 py-2">
                  {l.empresa_id ? (
                    <Link href={`/admin/empresas/${l.empresa_id}`} className="text-royal underline">
                      ver
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2">
                  {l.acao}
                  {l.tabela ? ` · ${l.tabela}` : ""}
                  {l.modo_suporte && <span className="ml-1 rounded bg-dourado/15 px-1 text-xs text-royal-escuro">suporte</span>}
                </td>
                <td className="max-w-md px-4 py-2 text-xs text-suave">
                  <Diferenca antes={l.valor_anterior} depois={l.valor_novo} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Cartao>
      <Cartao className="overflow-x-auto p-0">
        <h2 className="px-4 pt-4 text-base">Tentativas de acesso negado</h2>
        <ul className="mt-2 divide-y divide-borda text-sm">
          {(negados ?? []).map((n) => (
            <li key={n.id} className="px-4 py-2">
              {quando(n.criado_em)} · {n.email ?? "sem login"} · {n.rota} · {n.motivo} {n.ip ? `· ${n.ip}` : ""}
            </li>
          ))}
          {!negados?.length && <li className="px-4 py-3 text-suave">Nenhuma tentativa.</li>}
        </ul>
      </Cartao>
    </div>
  );
}

/** Mostra só os campos que mudaram. */
function Diferenca({ antes, depois }: { antes: Record<string, unknown> | null; depois: Record<string, unknown> | null }) {
  if (!antes && !depois) return <>—</>;
  if (!antes) return <>{JSON.stringify(depois).slice(0, 200)}</>;
  if (!depois) return <>excluído</>;
  const ignorar = new Set(["atualizado_em"]);
  const campos = Object.keys(depois).filter((k) => !ignorar.has(k) && JSON.stringify(antes[k]) !== JSON.stringify(depois[k]));
  return (
    <>
      {campos.map((k) => (
        <span key={k} className="block">
          {k}: {JSON.stringify(antes[k])} → {JSON.stringify(depois[k])}
        </span>
      ))}
    </>
  );
}
