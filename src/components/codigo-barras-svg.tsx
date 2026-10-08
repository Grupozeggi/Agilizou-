import { modulosCodigo } from "@/lib/codigo-barras";

/** Desenha o código de barras (EAN ou Code 128) em SVG, com o número embaixo. */
export function CodigoBarrasSvg({ codigo, altura = 48, className = "" }: { codigo: string; altura?: number; className?: string }) {
  const desenho = modulosCodigo(codigo);
  if (!desenho) return <p className="numero text-sm">{codigo}</p>;
  const { modulos } = desenho;
  const margem = 10; // zona de silêncio exigida pelos leitores
  const largura = modulos.length + margem * 2;
  const barras: { x: number; w: number }[] = [];
  for (let i = 0; i < modulos.length; i++) {
    if (modulos[i] !== "1") continue;
    let w = 1;
    while (modulos[i + w] === "1") w++;
    barras.push({ x: margem + i, w });
    i += w - 1;
  }
  return (
    <svg
      viewBox={`0 0 ${largura} ${altura + 12}`}
      className={className}
      role="img"
      aria-label={`Código de barras ${codigo}`}
      shapeRendering="crispEdges"
    >
      <rect width={largura} height={altura + 12} fill="#fff" />
      {barras.map((b) => (
        <rect key={b.x} x={b.x} y={0} width={b.w} height={altura} fill="#000" />
      ))}
      <text x={largura / 2} y={altura + 10} textAnchor="middle" fontSize="9" fontFamily="monospace" fill="#000">
        {codigo}
      </text>
    </svg>
  );
}
