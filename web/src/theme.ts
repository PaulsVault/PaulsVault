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
