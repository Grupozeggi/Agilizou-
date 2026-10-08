import { formatarReais } from "@/lib/dinheiro";

type Ponto = { mes: string; entradas: number; saidas: number };

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/**
 * Entradas x saídas por mês, em SVG puro (sem biblioteca).
 * Tons de azul nas barras; o mês atual ganha o destaque dourado.
 */
export function GraficoEntradasSaidas({ serie, mesAtual }: { serie: Ponto[]; mesAtual: string }) {
  const max = Math.max(1, ...serie.flatMap((p) => [p.entradas, p.saidas]));
  const largura = 320;
  const altura = 160;
  const base = altura - 22;
  const passo = largura / serie.length;
  const barra = Math.min(16, passo / 3);

  return (
    <figure>
      <svg viewBox={`0 0 ${largura} ${altura}`} className="h-44 w-full" role="img" aria-label="Entradas e saídas dos últimos 6 meses">
        <line x1="0" x2={largura} y1={base} y2={base} stroke="#E3E8F2" />
        {serie.map((p, i) => {
          const x = i * passo + passo / 2;
          const hE = (p.entradas / max) * (base - 8);
          const hS = (p.saidas / max) * (base - 8);
          const atual = p.mes === mesAtual;
          return (
            <g key={p.mes}>
              <rect x={x - barra - 1} y={base - hE} width={barra} height={hE} rx="3" fill="#2F5BEA">
                <title>{`Entradas: ${formatarReais(p.entradas)}`}</title>
              </rect>
              <rect x={x + 1} y={base - hS} width={barra} height={hS} rx="3" fill="#A9BCF5">
                <title>{`Saídas: ${formatarReais(p.saidas)}`}</title>
              </rect>
              <text
                x={x}
                y={altura - 6}
                textAnchor="middle"
                fontSize="11"
                fill={atual ? "#C9A24B" : "#5B6785"}
                fontWeight={atual ? 700 : 400}
              >
                {MESES[Number(p.mes.slice(5, 7)) - 1]}
              </text>
              {atual && <line x1={x - barra - 2} x2={x + barra + 2} y1={base + 3} y2={base + 3} stroke="#C9A24B" strokeWidth="2" />}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex gap-4 text-xs text-suave">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-royal-vivo" /> Entradas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[#A9BCF5]" /> Saídas
        </span>
      </figcaption>
      {/* Mesmos números em tabela para leitores de tela */}
      <table className="sr-only">
        <caption>Entradas e saídas por mês</caption>
        <tbody>
          {serie.map((p) => (
            <tr key={p.mes}>
              <th>{p.mes}</th>
              <td>{formatarReais(p.entradas)}</td>
              <td>{formatarReais(p.saidas)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
