// Dominio de maestrías de arma (regla 2024): las clases marciales pueden usar la propiedad de
// maestría (Cleave, Vex…) de un número de armas de su elección. Funciones sin I/O sobre `character`.
import { allEntries, findEntry } from "./content.js";
import { DomainError } from "./errors.js";
import { effectiveProficiencies, weaponCatProficient } from "./proficiency.js";
import type { Character } from "../types.js";

/** Nº de maestrías que el personaje conoce a su nivel (el máximo entre sus clases marciales). */
export function weaponMasteryMax(c: Character): number {
  let max = 0;
  for (const cl of c.classes) {
    const table = findEntry(cl.name, "class")?.data["weaponMastery"] as Record<string, number> | undefined;
    if (!table) continue;
    let best = 0;
    for (const [lvl, n] of Object.entries(table)) if (cl.level >= Number(lvl)) best = Math.max(best, n);
    max = Math.max(max, best);
  }
  return max;
}

export interface MasteryWeapon { name: string; mastery: string[] }

/** Armas del contenido con propiedad de maestría con las que el personaje es competente. */
export function eligibleMasteryWeapons(c: Character): MasteryWeapon[] {
  const eff = effectiveProficiencies(c);
  const out: MasteryWeapon[] = [];
  const seen = new Set<string>();
  for (const e of allEntries()) {
    if (e.type !== "item") continue;
    const d = e.data as Record<string, unknown>;
    const mastery = d["mastery"] as string[] | undefined;
    if (!Array.isArray(mastery) || !mastery.length) continue;
    const key = e.name.toLowerCase();
    if (seen.has(key)) continue;
    const cat = (d["weaponCategory"] as string | undefined)?.toLowerCase();
    const props = ((d["properties"] as string[] | undefined) ?? []).map((p) => p.toLowerCase());
    if (cat && !weaponCatProficient(eff.weapons, cat, props)) continue; // sin categoría → arma genérica, se permite
    seen.add(key);
    out.push({ name: e.name, mastery });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Fija las armas con maestría elegidas: respeta el máximo del nivel y exige maestría + competencia. */
export function setWeaponMasteries(c: Character, names: string[]): Character {
  const max = weaponMasteryMax(c);
  if (max === 0) throw new DomainError("rule", `${c.name} no tiene la aptitud Maestría con Armas (solo clases marciales).`);
  const uniq = [...new Set((names ?? []).map((n) => n.trim()).filter(Boolean))];
  if (uniq.length > max) throw new DomainError("rule", `Solo puedes elegir ${max} maestría(s) de arma a tu nivel.`);
  const eligible = new Set(eligibleMasteryWeapons(c).map((w) => w.name.toLowerCase()));
  for (const n of uniq) {
    if (!eligible.has(n.toLowerCase())) throw new DomainError("validation", `No puedes usar la maestría de "${n}" (necesitas competencia y que el arma tenga propiedad de maestría).`);
  }
  c.weaponMasteries = uniq;
  c.updatedAt = new Date().toISOString();
  return c;
}

/** Maestrías elegidas con su(s) propiedad(es) y la descripción de la regla, para la hoja. */
export function weaponMasteryView(c: Character): { max: number; chosen: { weapon: string; mastery: string; description: string | null }[] } {
  const chosen: { weapon: string; mastery: string; description: string | null }[] = [];
  for (const name of c.weaponMasteries ?? []) {
    const w = findEntry(name, "item")?.data["mastery"] as string[] | undefined;
    for (const m of w ?? []) {
      const desc = findEntry(m, "rule")?.data["summary"] as string | undefined;
      chosen.push({ weapon: name, mastery: m, description: desc ?? null });
    }
  }
  return { max: weaponMasteryMax(c), chosen };
}
