// Competencias de arma y armadura (reglas 2024). Fuente de verdad para saber si un personaje
// es competente con un objeto, y para las penalizaciones por usar equipo sin competencia
// (armadura sin competencia → desventaja FUE/DES + no lanza conjuros; arma sin competencia → sin bono).
//
// Las categorías de competencia por clase salen del contenido (clase principal = set completo;
// multiclase = set reducido del PHB 2024). Tokens de arma: "simple", "martial",
// "martial-light" (marcial con propiedad Light) y "martial-finesse-light" (marcial con Finesse o Light).

import { findEntry } from "./content.js";
import { SKILLS } from "../rules.js";
import type { Character, InventoryItem } from "../types.js";

export interface MulticlassProfs { armor?: string[]; weapons?: string[]; tools?: string[]; skillCount?: number; skillOptions?: string[]; }

// Competencias que otorga cada clase al MULTICLASEAR (set reducido, PHB 2024).
const MULTICLASS_PROFS: Record<string, MulticlassProfs> = {
  barbarian: { armor: ["shield"], weapons: ["martial"] },
  bard: { armor: ["light"], tools: ["Musical Instrument"], skillCount: 1, skillOptions: Object.keys(SKILLS) },
  cleric: { armor: ["light", "medium", "shield"] },
  druid: { armor: ["light", "shield"] },
  fighter: { armor: ["light", "medium", "shield"], weapons: ["martial"] },
  monk: {},
  paladin: { armor: ["light", "medium", "shield"], weapons: ["martial"] },
  ranger: { armor: ["light", "medium", "shield"], weapons: ["martial"], skillCount: 1, skillOptions: ["animal handling", "athletics", "insight", "investigation", "nature", "perception", "stealth", "survival"] },
  rogue: { armor: ["light"], tools: ["Thieves' Tools"], skillCount: 1, skillOptions: ["acrobatics", "athletics", "deception", "insight", "intimidation", "investigation", "perception", "persuasion", "sleight of hand", "stealth"] },
  sorcerer: {},
  warlock: { armor: ["light"] },
  wizard: {},
};

/** Competencias de multiclase de una clase (para mostrar y aplicar al tomar su primer nivel). */
export function multiclassProficiencies(className: string): MulticlassProfs {
  return MULTICLASS_PROFS[className.toLowerCase()] ?? {};
}

export interface EffectiveProfs { armor: Set<string>; weapons: Set<string>; }

/** Competencias efectivas: clase principal (completa del contenido) + multiclase (reducido) + las guardadas en la hoja. */
export function effectiveProficiencies(c: Character): EffectiveProfs {
  const armor = new Set<string>();
  const weapons = new Set<string>();
  c.classes.forEach((cl, idx) => {
    if (idx === 0) {
      const d = (findEntry(cl.name, "class")?.data ?? {}) as Record<string, unknown>;
      for (const a of ((d["armor"] as string[]) ?? [])) armor.add(a.toLowerCase());
      for (const w of ((d["weapons"] as string[]) ?? [])) weapons.add(w.toLowerCase());
    } else {
      const mc = multiclassProficiencies(cl.name);
      for (const a of mc.armor ?? []) armor.add(a.toLowerCase());
      for (const w of mc.weapons ?? []) weapons.add(w.toLowerCase());
    }
  });
  for (const a of c.proficiencies.armor) armor.add(a.toLowerCase());
  for (const w of c.proficiencies.weapons) weapons.add(w.toLowerCase());
  return { armor, weapons };
}

function itemContent(name: string): Record<string, unknown> {
  return (findEntry(name, "item")?.data ?? {}) as Record<string, unknown>;
}

function weaponCatProficient(tokens: Set<string>, category: string, props: string[]): boolean {
  const hasLight = props.some((p) => p.includes("light"));
  const hasFinesse = props.some((p) => p.includes("finesse"));
  for (const t of tokens) {
    if (t === category) return true;                                                       // "simple" / "martial"
    if (t === "martial-light" && category === "martial" && hasLight) return true;          // Monje
    if (t === "martial-finesse-light" && category === "martial" && (hasLight || hasFinesse)) return true; // Pícaro
  }
  return false;
}

/** ¿El personaje es competente con este objeto? Objetos sin categoría conocida → sí (no genera avisos falsos). */
export function isProficientWithItem(c: Character, it: InventoryItem): boolean {
  const eff = effectiveProficiencies(c);
  if (it.type === "armor" || it.type === "shield" || it.armorCategory) {
    const cat = (it.armorCategory ?? (itemContent(it.name)["armorCategory"] as string | undefined))?.toLowerCase();
    if (!cat) return true;
    return eff.armor.has(cat);
  }
  if (it.type === "weapon") {
    const cd = itemContent(it.name);
    const category = (cd["weaponCategory"] as string | undefined)?.toLowerCase();
    if (!category) return true; // el arma aún no trae categoría (pre-resync / homebrew) → no penalizar
    const props = (it.properties ?? (cd["properties"] as string[] | undefined) ?? []).map((p) => p.toLowerCase());
    return weaponCatProficient(eff.weapons, category, props);
  }
  return true; // otros tipos no requieren competencia
}

export interface ArmorPenalty { active: boolean; items: string[]; warning: string | null }

/** Penalización por llevar armadura/escudo EQUIPADO sin competencia (desventaja FUE/DES + no lanza conjuros). */
export function armorPenalty(c: Character): ArmorPenalty {
  const items = c.inventory
    .filter((it) => it.equipped && (it.type === "armor" || it.type === "shield") && !isProficientWithItem(c, it))
    .map((it) => it.name);
  const active = items.length > 0;
  return {
    active,
    items,
    warning: active
      ? `Llevas ${items.join(", ")} sin competencia: desventaja en pruebas, salvaciones y ataques de FUE y DES, y no puedes lanzar conjuros. Quítatelo para evitar la penalización.`
      : null,
  };
}

/** Característica que usa una habilidad (para saber si la penalización de armadura FUE/DES aplica). */
export function skillAbility(skill: string): string | undefined {
  return SKILLS[skill.toLowerCase()];
}
