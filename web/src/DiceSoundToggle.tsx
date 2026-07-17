import { useState } from "react";
import { diceSoundEnabled, setDiceSound } from "./theme";
import { playDiceSound } from "./diceSound";

export function DiceSoundToggle() {
  const [on, setOn] = useState(diceSoundEnabled());
  return (
    <button className="btn small" onClick={() => { const v = !on; setDiceSound(v); setOn(v); if (v) playDiceSound("normal"); }}
      title="Activa o silencia el sonido de los dados.">
      {on ? "🔊" : "🔇"} Dados
    </button>
  );
}
