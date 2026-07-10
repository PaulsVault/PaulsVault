import type { AbilityKey, Character, InventoryItem } from "./types.js";

export const ABILITIES: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];

export const SKILLS: Record<string, AbilityKey> = {
  acrobatics: "dex",
  "animal handling": "wis",
  arcana: "int",
  athletics: "str",
  deception: "cha",
  history: "int",
  insight: "wis",
  intimidation: "cha",
  investigation: "int",
  medicine: "wis",
  nature: "int",
  perception: "wis",
  performance: "cha",
  persuasion: "cha",
  religion: "int",
  "sleight of hand": "dex",
  stealth: "dex",
  survival: "wis",
};

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function totalLevel(c: Character): number {
  return c.classes.reduce((s, cl) => s + cl.level, 0);
}

export function proficiencyBonus(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

export function fmt(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/** CA calculada según armadura/escudo equipados (reglas 2024). */
export function computeAC(c: Character): { ac: number; formula: string } {
  if (c.acOverride != null) return { ac: c.acOverride, formula: "valor manual" };
  const dex = abilityMod(c.abilities.dex);
  const armor = c.inventory.find((i) => i.equipped && i.type === "armor");
  const shield = c.inventory.find((i) => i.equipped && (i.type === "shield" || i.armorCategory === "shield"));
  const shieldBonus = shield ? (shield.armorClass ?? 2) + (shield.magicBonus ?? 0) : 0;

  let base: number;
  let formula: string;
  if (!armor) {
    // Defensa sin armadura: 10 + DES, o la mejor variante según rasgos/clase (se elige la mayor).
    const has = (n: string) => c.features.some((f) => f.name.toLowerCase().includes(n));
    const hasClass = (n: string) => c.classes.some((cl) => cl.name.toLowerCase() === n);
    const options = [{ ac: 10 + dex, formula: `10 + DES(${fmt(dex)})` }];
    if (has("draconic resilience")) {
      const cha = abilityMod(c.abilities.cha);
      options.push({ ac: 10 + dex + cha, formula: `10 + DES(${fmt(dex)}) + CAR(${fmt(cha)})` });
    }
    if (hasClass("barbarian") && has("unarmored defense")) {
      const con = abilityMod(c.abilities.con);
      options.push({ ac: 10 + dex + con, formula: `10 + DES(${fmt(dex)}) + CON(${fmt(con)})` });
    }
    if (hasClass("monk") && has("unarmored defense")) {
      const wis = abilityMod(c.abilities.wis);
      options.push({ ac: 10 + dex + wis, formula: `10 + DES(${fmt(dex)}) + SAB(${fmt(wis)})` });
    }
    const best = options.reduce((a, b) => (b.ac > a.ac ? b : a));
    base = best.ac;
    formula = best.formula;
  } else {
    const bonus = armor.magicBonus ?? 0;
    const armorBase = (armor.armorClass ?? 10) + bonus;
    switch (armor.armorCategory) {
      case "heavy":
        base = armorBase;
        formula = `${armor.name} (${armorBase})`;
        break;
      case "medium":
        base = armorBase + Math.min(2, dex);
        formula = `${armor.name} (${armorBase}) + DES(máx +2)`;
        break;
      default:
        base = armorBase + dex;
        formula = `${armor.name} (${armorBase}) + DES(${fmt(dex)})`;
    }
  }
  if (shieldBonus) formula += ` + escudo(${fmt(shieldBonus)})`;
  return { ac: base + shieldBonus, formula };
}

export function skillBonus(c: Character, skill: string): { bonus: number; detail: string } {
  const key = skill.toLowerCase();
  const ab = SKILLS[key];
  if (!ab) {
    throw new Error(
      `Habilidad "${skill}" desconocida. Válidas: ${Object.keys(SKILLS).join(", ")}`
    );
  }
  const mod = abilityMod(c.abilities[ab]);
  const pb = proficiencyBonus(totalLevel(c));
  const hasExp = c.proficiencies.expertise.map((s) => s.toLowerCase()).includes(key);
  const hasProf = hasExp || c.proficiencies.skills.map((s) => s.toLowerCase()).includes(key);
  const bonus = mod + (hasExp ? pb * 2 : hasProf ? pb : 0);
  const detail = `${ab.toUpperCase()}(${fmt(mod)})${hasExp ? ` + pericia(${fmt(pb * 2)})` : hasProf ? ` + comp(${fmt(pb)})` : ""}`;
  return { bonus, detail };
}

export function saveBonus(c: Character, ability: AbilityKey): { bonus: number; detail: string } {
  const mod = abilityMod(c.abilities[ability]);
  const pb = proficiencyBonus(totalLevel(c));
  const prof = c.proficiencies.saves.includes(ability);
  return {
    bonus: mod + (prof ? pb : 0),
    detail: `${ability.toUpperCase()}(${fmt(mod)})${prof ? ` + comp(${fmt(pb)})` : ""}`,
  };
}

export function spellStats(c: Character): { dc: number; attack: number; ability: AbilityKey } | null {
  const ab = c.spellcasting.ability;
  if (!ab) return null;
  const pb = proficiencyBonus(totalLevel(c));
  const mod = abilityMod(c.abilities[ab]);
  return { dc: 8 + pb + mod, attack: pb + mod, ability: ab };
}

export function carriedWeight(c: Character): number {
  return c.inventory.reduce((s, i) => s + (i.weight ?? 0) * i.quantity, 0);
}

export function carryCapacity(c: Character): number {
  return c.abilities.str * 15;
}

/** Hoja completa con valores derivados: lo que un cliente/UI necesita para renderizar. */
export function computedSheet(c: Character): Record<string, unknown> {
  const level = totalLevel(c);
  const pb = proficiencyBonus(level);
  const { ac, formula } = computeAC(c);
  const spell = spellStats(c);
  const mods = Object.fromEntries(
    ABILITIES.map((a) => [a, { score: c.abilities[a], mod: abilityMod(c.abilities[a]) }])
  );
  const skills = Object.fromEntries(
    Object.keys(SKILLS).map((s) => [s, skillBonus(c, s).bonus])
  );
  const saves = Object.fromEntries(ABILITIES.map((a) => [a, saveBonus(c, a).bonus]));
  return {
    id: c.id,
    name: c.name,
    level,
    classes: c.classes.map((cl) => `${cl.name}${cl.subclass ? ` (${cl.subclass})` : ""} ${cl.level}`).join(" / "),
    species: c.species,
    background: c.background,
    proficiencyBonus: pb,
    abilities: mods,
    ac,
    acFormula: formula,
    initiative: abilityMod(c.abilities.dex) + c.initiativeBonus,
    speed: c.speed,
    hp: c.hp,
    hitDice: c.hitDice,
    deathSaves: c.deathSaves,
    passivePerception: 10 + skillBonus(c, "perception").bonus,
    saves,
    skills,
    spellcasting: spell
      ? { ...spell, slots: c.spellcasting.slots, pactSlots: c.spellcasting.pactSlots, concentratingOn: c.spellcasting.concentratingOn }
      : null,
    conditions: c.conditions,
    effects: c.effects,
    inspiration: c.inspiration,
    encumbrance: { carried: carriedWeight(c), capacity: carryCapacity(c) },
    currency: c.currency,
    style: c.style,
  };
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Slots de conjuro para lanzadores completos (tabla SRD 5.2). */
export const FULL_CASTER_SLOTS: Record<number, number[]> = {
  1: [2], 2: [3], 3: [4, 2], 4: [4, 3], 5: [4, 3, 2], 6: [4, 3, 3],
  7: [4, 3, 3, 1], 8: [4, 3, 3, 2], 9: [4, 3, 3, 3, 1], 10: [4, 3, 3, 3, 2],
  11: [4, 3, 3, 3, 2, 1], 12: [4, 3, 3, 3, 2, 1], 13: [4, 3, 3, 3, 2, 1, 1],
  14: [4, 3, 3, 3, 2, 1, 1], 15: [4, 3, 3, 3, 2, 1, 1, 1], 16: [4, 3, 3, 3, 2, 1, 1, 1],
  17: [4, 3, 3, 3, 2, 1, 1, 1, 1], 18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
  19: [4, 3, 3, 3, 3, 2, 1, 1, 1], 20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
};

export function slotsForCasterLevel(effectiveLevel: number): Record<string, { max: number; used: number }> {
  const row = FULL_CASTER_SLOTS[Math.max(0, Math.min(20, Math.round(effectiveLevel)))] ?? [];
  const out: Record<string, { max: number; used: number }> = {};
  row.forEach((max, i) => { out[String(i + 1)] = { max, used: 0 }; });
  return out;
}

/** Nivel de lanzador efectivo para multiclase (full=1, half=1/2, third=1/3). */
export function effectiveCasterLevel(c: Character): number {
  const FULL = ["wizard", "sorcerer", "cleric", "druid", "bard"];
  const HALF = ["paladin", "ranger"];
  const THIRD_SUBS = ["eldritch knight", "arcane trickster"];
  let lvl = 0;
  for (const cl of c.classes) {
    const n = cl.name.toLowerCase();
    if (FULL.includes(n)) lvl += cl.level;
    else if (HALF.includes(n)) lvl += Math.floor(cl.level / 2);
    else if (cl.subclass && THIRD_SUBS.includes(cl.subclass.toLowerCase())) lvl += Math.floor(cl.level / 3);
  }
  return lvl;
}

export function findItem(c: Character, idOrName: string): InventoryItem {
  const q = idOrName.trim().toLowerCase();
  const found =
    c.inventory.find((i) => i.id === idOrName) ??
    c.inventory.find((i) => i.name.toLowerCase() === q) ??
    c.inventory.find((i) => i.name.toLowerCase().includes(q));
  if (!found) {
    throw new Error(
      `Objeto "${idOrName}" no está en el inventario de ${c.name}. Objetos: ${c.inventory.map((i) => i.name).join(", ") || "ninguno"}`
    );
  }
  return found;
}
