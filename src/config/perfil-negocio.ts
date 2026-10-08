/**
 * Perguntas do cadastro (perfil do negócio).
 * Este é o ÚNICO lugar com o texto das perguntas e das respostas. Os valores
 * (chaves) são os mesmos aceitos pelo banco em public.perfil_negocio: para
 * criar uma resposta nova, altere aqui e na migration.
 */

export type Opcao = { valor: string; rotulo: string };

export type Pergunta = {
  campo: "tempo_negocio" | "equipe" | "faturamento" | "controle_caixa" | "dificuldade" | "origem";
  pergunta: string;
  /** Nome curto, para o painel do admin. */
  resumo: string;
  opcoes: Opcao[];
};

export const PERGUNTAS: Pergunta[] = [
  {
    campo: "tempo_negocio",
    pergunta: "Há quanto tempo o negócio existe?",
    resumo: "Tempo de negócio",
    opcoes: [
      { valor: "menos_1", rotulo: "Menos de 1 ano" },
      { valor: "1_a_3", rotulo: "De 1 a 3 anos" },
      { valor: "3_a_5", rotulo: "De 3 a 5 anos" },
      { valor: "5_a_10", rotulo: "De 5 a 10 anos" },
      { valor: "mais_10", rotulo: "Mais de 10 anos" },
    ],
  },
  {
    campo: "equipe",
    pergunta: "Quantas pessoas trabalham no negócio?",
    resumo: "Equipe",
    opcoes: [
      { valor: "so_eu", rotulo: "Só eu" },
      { valor: "2_a_5", rotulo: "De 2 a 5 pessoas" },
      { valor: "6_a_10", rotulo: "De 6 a 10 pessoas" },
      { valor: "mais_10", rotulo: "Mais de 10 pessoas" },
    ],
  },
  {
    campo: "faturamento",
    pergunta: "Quanto o negócio fatura por mês, mais ou menos?",
    resumo: "Faturamento mensal",
    opcoes: [
      { valor: "ate_5k", rotulo: "Até R$ 5 mil" },
      { valor: "5k_a_15k", rotulo: "De R$ 5 mil a R$ 15 mil" },
      { valor: "15k_a_30k", rotulo: "De R$ 15 mil a R$ 30 mil" },
      { valor: "30k_a_60k", rotulo: "De R$ 30 mil a R$ 60 mil" },
      { valor: "mais_60k", rotulo: "Mais de R$ 60 mil" },
      { valor: "nao_informar", rotulo: "Prefiro não dizer" },
    ],
  },
  {
    campo: "controle_caixa",
    pergunta: "Como você controla o caixa hoje?",
    resumo: "Controle do caixa",
    opcoes: [
      { valor: "nao_controla", rotulo: "Não controlo" },
      { valor: "caderno", rotulo: "Caderno ou papel" },
      { valor: "planilha", rotulo: "Planilha" },
      { valor: "outro_sistema", rotulo: "Outro sistema" },
    ],
  },
  {
    campo: "dificuldade",
    pergunta: "Qual é a sua maior dificuldade hoje?",
    resumo: "Maior dificuldade",
    opcoes: [
      { valor: "saber_lucro", rotulo: "Saber se estou tendo lucro" },
      { valor: "contas", rotulo: "Controlar contas a pagar e a receber" },
      { valor: "estoque", rotulo: "Controlar o estoque" },
      { valor: "agenda", rotulo: "Organizar a agenda e as faltas" },
      { valor: "vender_mais", rotulo: "Atrair mais clientes" },
      { valor: "falta_tempo", rotulo: "Falta de tempo para organizar" },
      { valor: "outra", rotulo: "Outra" },
    ],
  },
  {
    campo: "origem",
    pergunta: "Como você conheceu o Agilizou?",
    resumo: "Como conheceu",
    opcoes: [
      { valor: "indicacao", rotulo: "Indicação de alguém" },
      { valor: "instagram", rotulo: "Instagram ou redes sociais" },
      { valor: "google", rotulo: "Pesquisa no Google" },
      { valor: "agencia", rotulo: "Pela minha agência de marketing" },
      { valor: "outro", rotulo: "Outro" },
    ],
  },
];

export type CampoPerfil = Pergunta["campo"];

/** Em qual tela do onboarding cada pergunta aparece (3 = sobre o negócio, 4 = para terminar). */
export const TELA_DA_PERGUNTA: Record<CampoPerfil, 3 | 4> = {
  tempo_negocio: 3,
  equipe: 3,
  faturamento: 3,
  controle_caixa: 3,
  dificuldade: 4,
  origem: 4,
};

const porCampo = new Map(PERGUNTAS.map((p) => [p.campo, p]));

/** Valores aceitos de uma pergunta. */
export const valoresDe = (campo: CampoPerfil) => porCampo.get(campo)!.opcoes.map((o) => o.valor);

/** Texto da resposta guardada (ou null se não respondeu / valor desconhecido). */
export function rotuloDaResposta(campo: CampoPerfil, valor: string | null | undefined): string | null {
  if (!valor) return null;
  return porCampo.get(campo)?.opcoes.find((o) => o.valor === valor)?.rotulo ?? null;
}
