// Gestor singleton de dados 3D (dice-box), con carga DIFERIDA: el motor (~500KB + WASM) solo se
// descarga cuando el usuario activa los dados 3D. La app manda el resultado (value); la física anima.
export type Die = { sides: number; value: number };
export type Profile = "fast" | "normal" | "heavy";

interface DiceBoxInstance {
  init: () => Promise<unknown>;
  roll: (notation: unknown) => Promise<unknown>;
  clear: () => void;
  updateConfig?: (config: Record<string, unknown>) => void;
  onRollComplete?: (results: unknown) => void;
}

const PROFILES: Record<Profile, Record<string, number>> = {
  fast: { gravity: 1, mass: 1, friction: 0.6, restitution: 0.55, linearDamping: 0.3, angularDamping: 0.2, spinForce: 9, throwForce: 8, startingHeight: 12 },
  normal: { gravity: 2, mass: 1, friction: 0.8, restitution: 0.4, linearDamping: 0.4, angularDamping: 0.3, spinForce: 6, throwForce: 5, startingHeight: 8 },
  heavy: { gravity: 3, mass: 2, friction: 1, restitution: 0.2, linearDamping: 0.6, angularDamping: 0.5, spinForce: 4, throwForce: 3, startingHeight: 5 },
};

let box: DiceBoxInstance | null = null;
let initPromise: Promise<unknown> | null = null;

function host(): HTMLElement {
  let el = document.getElementById("dice3d-host");
  if (!el) {
    el = document.createElement("div");
    el.id = "dice3d-host";
    document.body.appendChild(el);
  }
  return el;
}

async function ensureBox(themeColor: string): Promise<DiceBoxInstance> {
  host();
  if (!box) {
    const { default: DiceBox } = await import("@3d-dice/dice-box");
    box = new DiceBox("#dice3d-host", { assetPath: "/assets/dice-box/", theme: "default", themeColor, scale: 6, ...PROFILES.normal }) as unknown as DiceBoxInstance;
    initPromise = box.init();
  }
  await initPromise;
  return box;
}

/** Precarga el motor (chunk + WASM + assets) para que la primera tirada no tenga retardo. */
export function preloadDice3D(themeColor: string): void {
  void ensureBox(themeColor).catch(() => { /* si falla, se usa el 2D */ });
}

/** Lanza los dados 3D con su resultado forzado. onComplete se llama al detenerse. */
export async function rollDice3D(dice: Die[], themeColor: string, profile: Profile, onComplete?: () => void): Promise<void> {
  const b = await ensureBox(themeColor);
  try { b.updateConfig?.({ themeColor, ...PROFILES[profile] }); } catch { /* noop */ }
  host().classList.add("show");
  b.onRollComplete = () => onComplete?.();
  await b.roll(dice.map((d) => ({ qty: 1, sides: d.sides, value: d.value })));
}

export function clearDice3D(): void {
  try { box?.clear?.(); } catch { /* noop */ }
  document.getElementById("dice3d-host")?.classList.remove("show");
}
