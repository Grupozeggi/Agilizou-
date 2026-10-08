import "server-only";
import { limitesDaEmpresa, type Limites, type PlanoId } from "@/config/planos";
import { partesSp } from "@/lib/agenda";
import { formatarData } from "@/lib/datas";
import { preencher } from "@/lib/mensagens";
import { lerRegua, planejarEnvios } from "@/lib/regua";
import { criarClienteServico } from "@/lib/supabase/servico";
import type { criarClienteServidor } from "@/lib/supabase/servidor";
import { custoEstimadoCentavos } from "@/services/whatsapp";

type Supabase = Awaited<ReturnType<typeof criarClienteServidor>>;

type Dados = {
  id: string;
  empresa_id: string;
  inicio: string;
  status: string;
  cliente: { id: string; nome: string; whatsapp: string | null; aceita_mensagens: boolean } | null;
  servico: { nome: string } | null;
  profissional: { nome: string } | null;
  empresa: {
    nome: string;
    whatsapp_ativo: boolean;
    regua_whatsapp: unknown;
    plano: PlanoId;
    limites_personalizados: Partial<Limites> | null;
  } | null;
};

/**
 * Coloca na fila as mensagens de confirmação de um agendamento.
 * A leitura usa o cliente do usuário (a RLS prova que o agendamento é dele);
 * a gravação usa a chave de serviço, porque o cliente não escreve na fila.
 * Falhar aqui nunca impede o agendamento: só registra no log.
 */
export async function planejarMensagens(supabase: Supabase, agendamentoId: string): Promise<number> {
  try {
    const { data: a } = await supabase
      .from("agendamentos")
      .select(
        "id, empresa_id, inicio, status, cliente:clientes(id, nome, whatsapp, aceita_mensagens), servico:servicos(nome), profissional:profissionais(nome), empresa:empresas(nome, whatsapp_ativo, regua_whatsapp, plano, limites_personalizados)",
      )
      .eq("id", agendamentoId)
      .maybeSingle<Dados>();
    if (!a?.empresa || !a.cliente?.whatsapp || !a.cliente.aceita_mensagens || !a.empresa.whatsapp_ativo) return 0;
    if (limitesDaEmpresa(a.empresa.plano, a.empresa.limites_personalizados).mensagensWhatsappPorMes <= 0) return 0;

    const envios = planejarEnvios(a.inicio, new Date().toISOString(), lerRegua(a.empresa.regua_whatsapp));
    if (!envios.length) return 0;
    const { data, hora } = partesSp(a.inicio);
    const regua = lerRegua(a.empresa.regua_whatsapp);
    const vars = {
      nome: a.cliente.nome.split(" ")[0],
      data: formatarData(data).slice(0, 5),
      hora,
      servico: a.servico?.nome ?? "atendimento",
      profissional: a.profissional?.nome ?? "a equipe",
      empresa: a.empresa.nome,
    };
    const linhas = envios.map((e) => ({
      empresa_id: a.empresa_id,
      agendamento_id: a.id,
      cliente_id: a.cliente!.id,
      etapa: e.etapa,
      telefone: a.cliente!.whatsapp!,
      conteudo: preencher(regua.find((r) => r.etapa === e.etapa)!.modelo, vars),
      agendado_para: e.agendado_para,
      custo_estimado_centavos: custoEstimadoCentavos(),
    }));
    const { error } = await criarClienteServico()
      .from("mensagens_whatsapp")
      .upsert(linhas, { onConflict: "agendamento_id,etapa", ignoreDuplicates: true });
    if (error) throw error;
    return linhas.length;
  } catch (e) {
    console.error("[whatsapp] não foi possível planejar as mensagens", agendamentoId, e);
    return 0;
  }
}
