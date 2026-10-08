/**
 * Templates por nicho. O núcleo do sistema é o mesmo para todos: o nicho só
 * muda as categorias iniciais, os nomes exibidos e se a agenda começa ligada.
 * Tudo isso é editável depois pelo dono.
 */

export type NichoId = "mecanica" | "odontologia" | "salao" | "varejo" | "outro";

export type CategoriaModelo = {
  tipo: "entrada" | "saida";
  /** Grupo do resultado do mês: receita, custo (ligado ao que vende) ou despesa (do dia a dia). */
  grupo: "receita" | "custo" | "despesa";
  nome: string;
};

export type Nicho = {
  id: NichoId;
  nome: string;
  descricao: string;
  agendaAtiva: boolean;
  termos: {
    cliente: string;
    clientes: string;
    profissional: string;
    profissionais: string;
  };
  categorias: CategoriaModelo[];
};

const receita = (nome: string): CategoriaModelo => ({ tipo: "entrada", grupo: "receita", nome });
const custo = (nome: string): CategoriaModelo => ({ tipo: "saida", grupo: "custo", nome });
const despesa = (nome: string): CategoriaModelo => ({ tipo: "saida", grupo: "despesa", nome });

const termosPadrao = {
  cliente: "cliente",
  clientes: "clientes",
  profissional: "profissional",
  profissionais: "profissionais",
};

export const NICHOS: Record<NichoId, Nicho> = {
  mecanica: {
    id: "mecanica",
    nome: "Mecânica",
    descricao: "Oficina, autopeças, funilaria",
    agendaAtiva: false,
    termos: { ...termosPadrao, profissional: "mecânico", profissionais: "mecânicos" },
    categorias: [
      receita("Serviço"),
      receita("Peça"),
      receita("Outras entradas"),
      custo("Peças"),
      despesa("Aluguel"),
      despesa("Ferramentas"),
      despesa("Funcionário"),
      despesa("Água, luz e internet"),
      despesa("Outras saídas"),
    ],
  },
  odontologia: {
    id: "odontologia",
    nome: "Clínica odontológica",
    descricao: "Consultório, clínica, ortodontia",
    agendaAtiva: true,
    termos: { cliente: "paciente", clientes: "pacientes", profissional: "dentista", profissionais: "dentistas" },
    categorias: [
      receita("Consulta"),
      receita("Procedimento"),
      receita("Ortodontia"),
      receita("Outras entradas"),
      custo("Material"),
      custo("Laboratório"),
      custo("Repasse a dentista"),
      despesa("Aluguel"),
      despesa("Funcionário"),
      despesa("Água, luz e internet"),
      despesa("Outras saídas"),
    ],
  },
  salao: {
    id: "salao",
    nome: "Salão ou barbearia",
    descricao: "Cabelo, barba, estética, unhas",
    agendaAtiva: true,
    termos: termosPadrao,
    categorias: [
      receita("Serviço"),
      receita("Venda de produto"),
      receita("Outras entradas"),
      custo("Produtos"),
      custo("Comissão"),
      despesa("Aluguel"),
      despesa("Água, luz e internet"),
      despesa("Outras saídas"),
    ],
  },
  varejo: {
    id: "varejo",
    nome: "Loja ou varejo",
    descricao: "Loja física, mercadinho, online",
    agendaAtiva: false,
    termos: { ...termosPadrao, profissional: "vendedor", profissionais: "vendedores" },
    categorias: [
      receita("Venda"),
      receita("Outras entradas"),
      custo("Mercadoria"),
      custo("Frete"),
      despesa("Aluguel"),
      despesa("Funcionário"),
      despesa("Água, luz e internet"),
      despesa("Outras saídas"),
    ],
  },
  outro: {
    id: "outro",
    nome: "Outro",
    descricao: "Serviços em geral e outros negócios",
    agendaAtiva: true,
    termos: termosPadrao,
    categorias: [
      receita("Serviço"),
      receita("Venda"),
      receita("Outras entradas"),
      custo("Compras"),
      despesa("Aluguel"),
      despesa("Funcionário"),
      despesa("Água, luz e internet"),
      despesa("Outras saídas"),
    ],
  },
};

export const LISTA_NICHOS = Object.values(NICHOS);

export function nichoValido(id: string): id is NichoId {
  return Object.hasOwn(NICHOS, id);
}

export function termosDoNicho(id: string) {
  return nichoValido(id) ? NICHOS[id].termos : termosPadrao;
}
