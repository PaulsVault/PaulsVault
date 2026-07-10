// Hoja calculada para la API: computedSheet base + valores finales con modificadores activos,
// más desgloses de cálculo (de dónde sale cada número), armas equipadas y trucos (para tirar desde la hoja).
import { ABILITIES, SKILLS, computedSheet, saveBonus, skillBonus } from "../rules.js";
import { computeActiveModifiers } from "../domain/modifiers.js";
import { findEntry } from "../domain/content.js";
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

  const classList = c.classes.map((cl) => ({ name: cl.name, subclass: cl.subclass ?? null, level: cl.level }));
  const features = c.features.map((f) => ({ name: f.name, source: f.source, description: f.description ?? null }));

  // Rasgos raciales de la especie (del contenido) para la sección de información.
  const speciesTraits = (findEntry(c.species, "species")?.data["traits"] as string[] | undefined) ?? [];
  // Diario ordenado por fecha descendente (lo más reciente primero).
  const journal = [...(c.journal ?? [])].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1)));

  return {
    ...base,
    ac: mods.ac.final,
    acBase: mods.ac.base,
    speed: mods.speed.final,
    speedBase: mods.speed.base,
    initiative: (base["initiative"] as number) + mods.initiativeFlat,
    critRange: mods.critRange,
    skillDetails,
    saveDetails,
    weapons,
    cantrips,
    classList,
    features,
    speciesTraits,
    personality: c.personality ?? {},
    journal,
    appearance: c.appearance ?? null,
    backstory: c.backstory ?? null,
    notes: c.notes ?? null,
    alignment: c.alignment ?? null,
    modifiers: mods,
  };
}
