import type { Metadata } from "next";
import Link from "next/link";
import { NICHOS, type NichoId } from "@/config/nichos";
import { limitesDaEmpresa, PLANOS, situacaoLimite, type Limites, type PlanoId } from "@/config/planos";
import { dataSp, formatarData } from "@/lib/datas";
import { formatarWhatsapp } from "@/lib/mensagens";
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
  proxima_cobranca: string | null;
  quer_marketing: boolean;
  marketing_pedido_em: string | null;
  whatsapp_contato: string | null;
  slug: string | null;
  agendamento_online: boolean;
};

const DIA_MS = 86_400_000;

/** Filtros rápidos da lista (parâmetro ?f=). */
const FILTROS: { id: string; rotulo: string; passa: (e: Linha, agora: number) => boolean }[] = [
  { id: "", rotulo: "Todas", passa: () => true },
  {
    id: "teste-acabando",
    rotulo: "Teste acabando (3 dias)",
    passa: (e, agora) => e.status_assinatura === "teste" && Date.parse(e.teste_ate) > agora && Date.parse(e.teste_ate) <= agora + 3 * DIA_MS,
  },
  { id: "teste-vencido", rotulo: "Teste vencido", passa: (e, agora) => e.status_assinatura === "teste" && Date.parse(e.teste_ate) <= agora },
  { id: "inadimplentes", rotulo: "Inadimplentes", passa: (e) => e.status_assinatura === "inadimplente" },
  { id: "marketing", rotulo: "Pediram marketing", passa: (e) => e.quer_marketing },
];

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
  const todas = data as Linha[];
  // A página é montada a cada acesso (sessão do admin): "agora" é o momento do acesso.
  const agora = new Date().getTime();
  const filtro = FILTROS.find((f) => f.id === p.f) ?? FILTROS[0];
  const linhas = todas.filter((e) => filtro.passa(e, agora));
  const hrefFiltro = (id: string) => {
    const q = new URLSearchParams({ ...(busca ? { q: busca } : {}), ...(id ? { f: id } : {}) });
    return q.size ? `/admin/empresas?${q}` : "/admin/empresas";
  };
  /** "faltam 2 dias", "vence hoje" ou "venceu há 3 dias" para contas em teste. */
  const prazoTeste = (testeAte: string) => {
    const dias = Math.ceil((Date.parse(testeAte) - agora) / DIA_MS);
    if (dias > 1) return `faltam ${dias} dias`;
    if (dias === 1) return "falta 1 dia";
    if (Date.parse(testeAte) > agora) return "vence hoje";
    const passados = Math.floor((agora - Date.parse(testeAte)) / DIA_MS);
    return passados === 0 ? "venceu hoje" : `venceu há ${passados} ${passados === 1 ? "dia" : "dias"}`;
  };

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
        {filtro.id && <input type="hidden" name="f" value={filtro.id} />}
        <input
          name="q"
          defaultValue={busca}
          placeholder="Buscar por nome, e-mail ou nicho"
          className="h-11 w-full max-w-md rounded-xl border border-borda bg-white px-4 outline-none focus:border-royal-vivo"
        />
      </form>
      <div className="flex flex-wrap gap-2 text-sm">
        {FILTROS.map((f) => (
          <Link
            key={f.id || "todas"}
            href={hrefFiltro(f.id)}
            className={`rounded-full border px-3 py-1.5 font-medium ${f.id === filtro.id ? "border-royal-vivo bg-royal-claro text-royal" : "border-borda bg-white text-suave"}`}
          >
            {f.rotulo} <span className="numero">({todas.filter((e) => f.passa(e, agora)).length})</span>
          </Link>
        ))}
      </div>
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
                    {e.quer_marketing && (
                      <span className="mt-1 inline-block rounded-full bg-dourado/15 px-2 py-0.5 text-xs font-semibold text-royal-escuro">
                        pediu marketing{e.marketing_pedido_em ? ` em ${formatarData(dataSp(e.marketing_pedido_em))}` : ""}
                        {e.whatsapp_contato ? ` · ${formatarWhatsapp(e.whatsapp_contato)}` : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{PLANOS[e.plano].nome}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COR[e.status_assinatura]}`}>{e.status_assinatura}</span>
                    {e.status_assinatura === "teste" && (
                      <span className={`block text-xs ${Date.parse(e.teste_ate) <= agora ? "font-semibold text-saida" : "text-suave"}`}>
                        até {formatarData(dataSp(e.teste_ate))} · {prazoTeste(e.teste_ate)}
                      </span>
                    )}
                    {e.status_assinatura !== "teste" && e.proxima_cobranca && (
                      <span className="block text-xs text-suave">cobrança em {formatarData(e.proxima_cobranca)}</span>
                    )}
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
