import { useEffect, useState } from "react";
import { DiceRoll, type RollView } from "./DiceRoll";
import { Dice3D, type Roll3D } from "./Dice3D";
import { type Die } from "./diceEngine";
import { dice3dEnabled } from "./theme";
import { playDiceSound } from "./diceSound";
import { setRollListener, type PresentRoll } from "./rollPresenter";

// Se monta UNA sola vez (en CharacterView). Escucha las tiradas de todos los paneles y muestra
// el dado 2D o 3D según el toggle. themeColor y material vienen del estilo del personaje.
export function DiceOverlay({ themeColor, material = "none" }: { themeColor: string; material?: string }) {
  const [roll, setRoll] = useState<RollView | null>(null);
  const [roll3d, setRoll3d] = useState<Roll3D | null>(null);

  useEffect(() => {
    setRollListener((r: PresentRoll) => {
      playDiceSound(r.profile ?? "normal"); // sonido de dados (respeta el toggle)
      const dice: Die[] = r.dice3d && r.dice3d.length
        ? r.dice3d
        : (r.natural != null ? [{ sides: 20, value: r.natural }] : []);
      if (dice3dEnabled() && dice.length) {
        setRoll3d({ dice, label: r.label, total: r.total, detail: r.detail, crit: r.crit ?? null, themeColor, profile: r.profile ?? "normal", material });
      } else {
        setRoll({ label: r.label, total: r.total, breakdown: r.breakdown ?? "", detail: r.detail, crit: r.crit ?? null, faces: r.faces });
      }
    });
    return () => setRollListener(null);
  }, [themeColor, material]);

  return (
    <>
      {roll && <DiceRoll roll={roll} onClose={() => setRoll(null)} />}
      {roll3d && <Dice3D roll={roll3d} onClose={() => setRoll3d(null)} />}
    </>
  );
}
