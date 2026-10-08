import type { Metadata } from "next";
import Link from "next/link";
import { NICHOS, type NichoId } from "@/config/nichos";
import { limitesDaEmpresa, PLANOS, situacaoLimite, type Limites, type PlanoId } from "@/config/planos";
import { dataSp, formatarData } from "@/lib/datas";
import { exigirAdmin } from "@/lib/sessao";

export const metadata: Metadata = { title: "Empresas" };

type Linha = {
  id: string;
  nome: string;
  nicho: NichoId;
  plano: PlanoId;
  status_assinatura: string;
  teste_ate: string;
  criado_em: string;
  ultimo_acesso_em: string | null;
  emails: string | null;
  lancamentos_mes: number;
  produtos: number;
  clientes: number;
  profissionais: number;
  limites_personalizados: Partial<Limites> | null;
};

const COR: Record<string, string> = {
  ativo: "bg-entrada/10 text-entrada",
  teste: "bg-royal-claro text-royal",
  inadimplente: "bg-saida/10 text-saida",
  cancelado: "bg-cartao text-suave",
  suspenso: "bg-dourado/15 text-royal-escuro",
};

export default async function Empresas({ searchParams }: PageProps<"/admin/empresas">) {
  const p = await searchParams;
  const busca = typeof p.q === "string" ? p.q.slice(0, 80) : "";
  const { supabase } = await exigirAdmin();
  const { data, error } = await supabase.rpc("admin_empresas", { p_busca: busca || null });
  if (error) throw new Error("Não foi possível carregar as empresas.");
  const linhas = data as Linha[];

  const uso = (usado: number, limite: number) => {
    const s = situacaoLimite(usado, limite);
    return (
      <span className={`numero ${s === "bloqueado" ? "font-semibold text-saida" : s === "aviso" ? "text-dourado" : "text-texto"}`}>
        {usado}/{limite === Infinity ? "∞" : limite}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl">Empresas</h1>
      <form>
        <input
          name="q"
          defaultValue={busca}
          placeholder="Buscar por nome, e-mail ou nicho"
          className="h-11 w-full max-w-md rounded-xl border border-borda bg-white px-4 outline-none focus:border-royal-vivo"
        />
      </form>
      <div className="overflow-x-auto rounded-cartao bg-white shadow-suave">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-borda text-xs text-suave">
            <tr>
              {["Empresa", "Plano", "Situação", "Cadastro", "Último acesso", "Lanç./mês", "Produtos", "Clientes", "Profiss."].map((h) => (
                <th key={h} className="px-3 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {linhas.map((e) => {
              const l = limitesDaEmpresa(e.plano, e.limites_personalizados);
              return (
                <tr key={e.id} className="hover:bg-cartao">
                  <td className="px-3 py-2">
                    <Link href={`/admin/empresas/${e.id}`} className="font-semibold text-royal hover:underline">
                      {e.nome}
                    </Link>
                    <span className="block text-xs text-suave">
                      {e.emails} · {NICHOS[e.nicho]?.nome}
                    </span>
                  </td>
                  <td className="px-3 py-2">{PLANOS[e.plano].nome}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COR[e.status_assinatura]}`}>{e.status_assinatura}</span>
                    {e.status_assinatura === "teste" && <span className="block text-xs text-suave">até {formatarData(dataSp(e.teste_ate))}</span>}
                  </td>
                  <td className="numero px-3 py-2">{formatarData(dataSp(e.criado_em))}</td>
                  <td className="numero px-3 py-2">{e.ultimo_acesso_em ? formatarData(dataSp(e.ultimo_acesso_em)) : "—"}</td>
                  <td className="px-3 py-2">{uso(Number(e.lancamentos_mes), l.lancamentosPorMes)}</td>
                  <td className="px-3 py-2">{uso(Number(e.produtos), l.produtos)}</td>
                  <td className="px-3 py-2">{uso(Number(e.clientes), l.clientes)}</td>
                  <td className="px-3 py-2">{uso(Number(e.profissionais), l.profissionais)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {linhas.length === 0 && <p className="p-4 text-sm text-suave">Nenhuma empresa encontrada.</p>}
      </div>
    </div>
  );
}
