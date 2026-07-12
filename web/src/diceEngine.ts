// Motor de dados 3D (dice-box-threejs), con carga DIFERIDA: el motor solo se descarga cuando
// el usuario activa los dados 3D. Es 100% procedural (sin texturas/sonidos que copiar) y el fondo
// es transparente (solo se ven los dados y su sombra sobre la app).
//
// CLAVE: esta librería SÍ permite forzar el resultado. La app decide el número (motor de reglas con
// crypto) y se lo pasamos como notación "1d20@15" → el dado cae físicamente en esa cara.
export type Die = { sides: number; value: number };
export type Profile = "fast" | "normal" | "heavy";

interface DiceBoxInstance {
  initialize: () => Promise<unknown>;
  roll: (notation: string) => Promise<unknown>;
  clearDice: () => void;
  updateConfig: (config: Record<string, unknown>) => Promise<unknown>;
  onRollComplete?: (results: unknown) => void;
  strength: number;
}

// La "fuerza" del lanzamiento da el carácter: ataques rápidos y secos, daño pesado y lento.
const STRENGTH: Record<Profile, number> = { fast: 2.2, normal: 1.5, heavy: 1 };

let box: DiceBoxInstance | null = null;
let initPromise: Promise<unknown> | null = null;
let currentColor = "";

function host(): HTMLElement {
  let el = document.getElementById("dice3d-host");
  if (!el) {
    el = document.createElement("div");
    el.id = "dice3d-host";
    document.body.appendChild(el);
  }
  return el;
}

// Luminancia relativa del color, para elegir números legibles (claros sobre dado oscuro y viceversa).
function luminance(hex: string): number {
  const m = /^#?([\da-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.3;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function colorset(hex: string): Record<string, unknown> {
  const light = luminance(hex) > 0.6;
  return {
    name: `dnd-${hex}`,
    background: hex,
    foreground: light ? "#1a1730" : "#ffffff", // color de los números
    outline: light ? "#ffffff" : "#000000",    // contorno de los números
    edge: hex,
    texture: "none",
    material: "plastic",
  };
}

async function ensureBox(themeColor: string): Promise<DiceBoxInstance> {
  host();
  if (!box) {
    currentColor = themeColor;
    const { default: DiceBox } = await import("@3d-dice/dice-box-threejs");
    box = new DiceBox("#dice3d-host", {
      framerate: 1 / 60,
      sounds: false,
      shadows: true,
      theme_customColorset: colorset(themeColor),
      theme_material: "plastic",
      theme_texture: "none",
      gravity_multiplier: 400,
      light_intensity: 0.9,
      baseScale: 100,
      strength: STRENGTH.normal,
    }) as unknown as DiceBoxInstance;
    initPromise = box.initialize();
  }
  await initPromise;
  return box;
}

// Construye "1d20@15" o "1d6+1d6@4,5": un dado por elemento, en orden, con su cara forzada.
function notationFor(dice: Die[]): string {
  const groups = dice.map((d) => `1d${d.sides}`).join("+");
  const values = dice.map((d) => d.value).join(",");
  return `${groups}@${values}`;
}

/** Precarga el motor (chunk + geometría) para que la primera tirada no tenga retardo. */
export function preloadDice3D(themeColor: string): void {
  void ensureBox(themeColor).catch(() => { /* si falla, se usa el 2D */ });
}

/** Lanza los dados 3D con su resultado forzado. onComplete se llama al detenerse. */
export async function rollDice3D(dice: Die[], themeColor: string, profile: Profile, onComplete?: () => void): Promise<void> {
  if (!dice.length) { onComplete?.(); return; }
  const b = await ensureBox(themeColor);
  if (themeColor !== currentColor) {
    currentColor = themeColor;
    try { await b.updateConfig({ theme_customColorset: colorset(themeColor) }); } catch { /* noop */ }
  }
  b.strength = STRENGTH[profile];
  host().classList.add("show");
  await b.roll(notationFor(dice));
  onComplete?.();
}

export function clearDice3D(): void {
  try { box?.clearDice?.(); } catch { /* noop */ }
  document.getElementById("dice3d-host")?.classList.remove("show");
}
