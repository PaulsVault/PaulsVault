// Presentador único de tiradas (patrón singleton, como el motor 3D). Cualquier panel llama a
// presentRoll(...) y el <DiceOverlay/> montado una sola vez en CharacterView decide mostrar el
// dado 2D o 3D según el toggle. Así toda la app (hoja, conjuros, objetos, bandeja) tira igual.
export interface PresentRoll {
  label: string;
  total: number;
  breakdown?: string;                             // desglose para el dado 2D
  detail?: string;                                // tipo de daño / detalle del modificador
  crit?: "critical" | "fumble" | null;
  faces?: number;                                 // cara del dado principal (2D)
  dice3d?: { sides: number; value: number }[];    // dados con su cara forzada (3D)
  natural?: number | null;                        // cara del d20 (3D de una sola tirada)
  profile?: "fast" | "normal" | "heavy";          // carácter del lanzamiento 3D
}

type Listener = (r: PresentRoll) => void;
let listener: Listener | null = null;

export function setRollListener(l: Listener | null): void { listener = l; }
export function presentRoll(r: PresentRoll): void { listener?.(r); }
