import { useEffect, useRef, useState } from "react";
import { clearDice3D, rollDice3D, type Die, type Profile } from "./diceEngine";

export interface Roll3D {
  dice: Die[];
  label: string;
  total: number;
  detail?: string;
  crit?: "critical" | "fumble" | null;
  themeColor: string;
  profile: Profile;
}

export function Dice3D({ roll, onClose }: { roll: Roll3D; onClose: () => void }) {
  const [landed, setLanded] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    setLanded(false);
    let timer: number | undefined;
    void rollDice3D(roll.dice, roll.themeColor, roll.profile, () => {
      setLanded(true);
      timer = window.setTimeout(() => closeRef.current(), 4500);
    });
    return () => { window.clearTimeout(timer); clearDice3D(); };
  }, [roll]);

  const close = () => { clearDice3D(); onClose(); };
  const critCls = landed && roll.crit === "critical" ? "crit" : landed && roll.crit === "fumble" ? "fumble" : "";

  return (
    <div className="dice3d-overlay" onClick={close}>
      <div className={`dice3d-card ${critCls}`} onClick={(e) => e.stopPropagation()}>
        <div className="roll-label">{roll.label}</div>
        {!landed && <div className="muted small">Lanzando…</div>}
        {landed && (
          <>
            {roll.crit === "critical" && <div className="roll-tag good">¡CRÍTICO!</div>}
            {roll.crit === "fumble" && <div className="roll-tag bad">¡Pifia!</div>}
            <div className="roll-total dice3d-total">{roll.total}</div>
            {roll.detail && <div className="roll-detail">{roll.detail}</div>}
            <button className="btn small" onClick={close}>Cerrar</button>
          </>
        )}
      </div>
    </div>
  );
}
