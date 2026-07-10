// Icono SVG del área de efecto de un conjuro, con el tamaño en pies.
const LABEL: Record<string, string> = {
  sphere: "Esfera", cone: "Cono", cube: "Cubo", line: "Línea", cylinder: "Cilindro", emanation: "Emanación",
};

export function AreaGlyph({ shape, size, range }: { shape?: string; size?: number; range?: string }) {
  if (!shape) return null;
  const shapeSvg = () => {
    switch (shape) {
      case "sphere": return <circle cx="24" cy="24" r="18" />;
      case "cone": return <path d="M24 6 L42 42 L6 42 Z" />;
      case "cube": return <rect x="7" y="7" width="34" height="34" rx="3" />;
      case "line": return <rect x="5" y="19" width="38" height="10" rx="3" />;
      case "cylinder": return <ellipse cx="24" cy="24" rx="18" ry="11" />;
      case "emanation": return <circle cx="24" cy="24" r="18" strokeDasharray="5 4" />;
      default: return <circle cx="24" cy="24" r="16" />;
    }
  };
  return (
    <div className="area-glyph" title={`${LABEL[shape] ?? shape}${size ? ` de ${size} ft` : ""}`}>
      <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">
        <g fill="var(--accent)" fillOpacity="0.22" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round">{shapeSvg()}</g>
      </svg>
      <div className="area-glyph-txt">
        <b>{LABEL[shape] ?? shape}</b>
        {size ? <span>{size} ft</span> : null}
        {range ? <span className="muted small">alcance {range}</span> : null}
      </div>
    </div>
  );
}
