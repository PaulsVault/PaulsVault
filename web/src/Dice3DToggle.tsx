import { useState } from "react";
import { dice3dEnabled, setDice3d } from "./theme";

export function Dice3DToggle() {
  const [on, setOn] = useState(dice3dEnabled());
  return (
    <button className="btn small" onClick={() => { const v = !on; setDice3d(v); setOn(v); }}
      title="Alterna entre dados 3D (premium) y 2D (ligero). En móvil el 2D es más fluido.">
      🎲 {on ? "3D" : "2D"}
    </button>
  );
}
