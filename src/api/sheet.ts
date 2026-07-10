// Hoja calculada para la API: computedSheet base + valores finales con modificadores activos,
// más desgloses de cálculo (de dónde sale cada número), armas equipadas y trucos (para tirar desde la hoja).
import { ABILITIES, SKILLS, computedSheet, saveBonus, skillBonus } from "../rules.js";
import { computeActiveModifiers } from "../domain/modifiers.js";
import type { Character } from "../types.js";

export function characterSheet(c: Character): Record<string, unknown> {
  const base = computedSheet(c) as Record<string, unknown>;
  const mods = computeActiveModifiers(c);

  const skillDetails = Object.fromEntries(Object.keys(SKILLS).map((s) => [s, skillBonus(c, s).detail]));
  const saveDetails = Object.fromEntries(ABILITIES.map((a) => [a, saveBonus(c, a).detail]));

  const weapons = c.inventory
    .filter((i) => i.type === "weapon")
    .map((i) => ({ id: i.id, name: i.name, damage: i.damage ?? null, equipped: i.equipped }));

  const cantrips = c.spellcasting.known
    .filter((s) => s.level === 0)
    .map((s) => ({ name: s.name }));

  return {
    ...base,
    ac: mods.ac.final,
    acBase: mods.ac.base,
    speed: mods.speed.final,
    speedBase: mods.speed.base,
    skillDetails,
    saveDetails,
    weapons,
    cantrips,
    modifiers: mods,
  };
}
