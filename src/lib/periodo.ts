import { paraIso, somarDias } from "./datas";
import { limitesDoMes } from "./lancamentos";

export type TipoPeriodo = "hoje" | "semana" | "mes" | "personalizado";

export type Periodo = { tipo: TipoPeriodo; inicio: string; fim: string };

/** Segunda-feira da semana de uma data 'aaaa-mm-dd'. */
export function inicioDaSemana(iso: string): string {
  const dia = new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return somarDias(iso, -((dia + 6) % 7));
}

function dataValida(v: unknown): string | null {
  if (typeof v !== "string") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return paraIso(v.split("-").reverse().join("/"));
  return paraIso(v);
}

/** Lê o período da URL (?periodo=semana, ?periodo=personalizado&de=...&ate=...). Padrão: mês atual. */
export function resolverPeriodo(params: Record<string, string | string[] | undefined>, hoje: string): Periodo {
  const tipo = params.periodo;
  if (tipo === "hoje") return { tipo, inicio: hoje, fim: hoje };
  if (tipo === "semana") {
    const inicio = inicioDaSemana(hoje);
    return { tipo, inicio, fim: somarDias(inicio, 6) };
  }
  if (tipo === "personalizado") {
    let de = dataValida(params.de);
    let ate = dataValida(params.ate);
    if (de && ate) {
      if (ate < de) [de, ate] = [ate, de];
      // Limite de 5 anos para a consulta não ficar pesada.
      if (Date.parse(ate) - Date.parse(de) <= 5 * 366 * 86_400_000) return { tipo, inicio: de, fim: ate };
    }
  }
  const { inicio, fim } = limitesDoMes(hoje);
  return { tipo: "mes", inicio, fim };
}
