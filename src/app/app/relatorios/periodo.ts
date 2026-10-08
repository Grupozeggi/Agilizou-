import { hojeIso } from "@/lib/datas";
import { limitesDoMes } from "@/lib/lancamentos";
import { resolverPeriodo } from "@/lib/periodo";

/** ?mes=2026-10 (padrão: mês atual) ou ?periodo=personalizado&de=&ate= */
export function periodoDosParametros(p: Record<string, string | string[] | undefined>) {
  if (p.periodo === "personalizado") return resolverPeriodo(p, hojeIso());
  const mes = typeof p.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(p.mes) ? p.mes : hojeIso().slice(0, 7);
  return { tipo: "mes" as const, ...limitesDoMes(`${mes}-01`) };
}
