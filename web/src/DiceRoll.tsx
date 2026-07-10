import { useEffect, useState } from "react";

export interface RollView {
  label: string;
  total: number;
  breakdown: string;
  detail?: string;
  crit?: "critical" | "fumble" | null;
  faces?: number; // cara del dado principal (20 por defecto)
}

export function DiceRoll({ roll, onClose }: { roll: RollView; onClose: () => void }) {
  const [display, setDisplay] = useState(1);
  const [rolling, setRolling] = useState(true);
  const faces = roll.faces ?? 20;

  useEffect(() => {
    setRolling(true);
    let n = 0;
    const iv = setInterval(() => {
      n++;
      setDisplay(Math.floor(Math.random() * faces) + 1);
      if (n > 13) { clearInterval(iv); setDisplay(roll.total); setRolling(false); }
    }, 45);
    const close = setTimeout(onClose, 4500);
    return () => { clearInterval(iv); clearTimeout(close); };
  }, [roll, onClose, faces]);

  const cls = !rolling && roll.crit === "critical" ? "crit" : !rolling && roll.crit === "fumble" ? "fumble" : "";

  return (
    <div className="roll-overlay" onClick={onClose}>
      <div className="roll-card" onClick={(e) => e.stopPropagation()}>
        <div className="roll-label">{roll.label}</div>
        <div className={`d20 ${rolling ? "spin" : "landed"} ${cls}`}>
          <svg viewBox="0 0 100 100" className="d20-shape" aria-hidden="true">
            <polygon points="50,4 92,28 92,72 50,96 8,72 8,28" />
            <polygon className="d20-facet" points="50,4 92,28 50,50 8,28" />
            <polygon className="d20-facet2" points="8,28 50,50 8,72" />
            <polygon className="d20-facet2" points="92,28 50,50 92,72" />
          </svg>
          <span className="d20-num">{display}</span>
        </div>
        {!rolling && (
          <>
            {roll.crit === "critical" && <div className="roll-tag good">¡CRÍTICO NATURAL!</div>}
            {roll.crit === "fumble" && <div className="roll-tag bad">¡Pifia!</div>}
            <div className="roll-breakdown">{roll.breakdown}</div>
            {roll.detail && <div className="roll-detail">{roll.detail}</div>}
          </>
        )}
        <button className="btn small" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}
