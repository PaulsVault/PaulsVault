// Hoja calculada para la API: computedSheet base + valores finales con modificadores activos.
import { computedSheet } from "../rules.js";
import { computeActiveModifiers } from "../domain/modifiers.js";
import type { Character } from "../types.js";

export function characterSheet(c: Character): Record<string, unknown> {
  const base = computedSheet(c) as Record<string, unknown>;
  const mods = computeActiveModifiers(c);
  return {
    ...base,
    ac: mods.ac.final,
    acBase: mods.ac.base,
    speed: mods.speed.final,
    speedBase: mods.speed.base,
    modifiers: mods,
  };
}
