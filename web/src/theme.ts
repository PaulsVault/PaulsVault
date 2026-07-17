// Tema global de la app (claro/oscuro), persistido en localStorage y aplicado a <html>.
export type AppTheme = "dark" | "light";
const KEY = "dnd-theme";

export function getTheme(): AppTheme {
  return localStorage.getItem(KEY) === "light" ? "light" : "dark";
}

export function applyTheme(t: AppTheme): void {
  if (t === "light") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
  localStorage.setItem(KEY, t);
}

/** Aplica el tema guardado al arrancar (evita parpadeo). */
export function initTheme(): void {
  applyTheme(getTheme());
}

// ─── Dados 3D (preferencia del dispositivo; por defecto apagado por rendimiento en móvil) ───
export function dice3dEnabled(): boolean {
  return localStorage.getItem("dnd-dice3d") === "on";
}
export function setDice3d(on: boolean): void {
  localStorage.setItem("dnd-dice3d", on ? "on" : "off");
}

// ─── Sonido de los dados (por defecto encendido; se sintetiza con WebAudio, sin archivos) ───
export function diceSoundEnabled(): boolean {
  return localStorage.getItem("dnd-dice-sound") !== "off";
}
export function setDiceSound(on: boolean): void {
  localStorage.setItem("dnd-dice-sound", on ? "on" : "off");
}
