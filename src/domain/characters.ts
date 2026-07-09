// Dominio de personajes: crear, listar, ver, actualizar, subir de nivel, borrar,
// exportar/importar y duplicar. Funciones sin I/O: reciben `db`/`character`, mutan y
// devuelven el resultado o lanzan DomainError. El adaptador (API) hace loadDb/saveDb.

import { findEntry } from "./content.js";
import { DomainError } from "./errors.js";
import {
  abilityMod, computedSheet, effectiveCasterLevel, newId,
  slotsForCasterLevel, totalLevel,
} from "../rules.js";
import type {
  AbilityKey, Abilities, Character, ClassLevel, Database, FeatureUses,
} from "../types.js";

// ─── Tipos de entrada ───

export interface CreateCharacterInput {
  name: string;
  className: string;
  subclass?: string;
  level?: number;
  species: string;
  background: string;
  abilities: Abilities;
  skills?: string[];
  alignment?: string;
  playerName?: string;
  appearance?: string;
  backstory?: string;
  speed?: number;
}

export interface UpdateCharacterInput {
  name?: string;
  species?: string;
  background?: string;
  alignment?: string;
  speed?: number;
  acOverride?: number | null;
  initiativeBonus?: number;
  inspiration?: boolean;
  xp?: number;
  appearance?: string;
  backstory?: string;
  notes?: string;
  abilities?: Partial<Abilities>;
  addSkills?: string[];
  removeSkills?: string[];
  addExpertise?: string[];
  addLanguages?: string[];
  addToolProficiencies?: string[];
  addFeatures?: { name: string; source?: string; description?: string; uses?: { max: number; recharge?: FeatureUses["recharge"] } }[];
  removeFeatures?: string[];
  spellcastingAbility?: AbilityKey | null;
}

export interface LevelUpInput {
  className?: string;
  subclass?: string;
  hpRoll?: number;
  abilityIncreases?: Partial<Abilities>;
}

export interface LevelUpResult {
  character: Character;
  className: string;
  classLevel: number;
  levelTotal: number;
  hpGained: number;
  isNewClass: boolean;
  subclass?: string;
}

// ─── Helpers ───

/** Localiza un personaje por id, nombre exacto o coincidencia parcial. Lanza si no existe. */
export function requireCharacter(db: Database, idOrName: string): Character {
  const q = idOrName.trim().toLowerCase();
  const found =
    db.characters.find((c) => c.id === idOrName) ??
    db.characters.find((c) => c.name.toLowerCase() === q) ??
    db.characters.find((c) => c.name.toLowerCase().includes(q));
  if (!found) {
    const names = db.characters.map((c) => `"${c.name}"`).join(", ") || "ninguno";
    throw new DomainError("not_found", `Personaje "${idOrName}" no encontrado. Existentes: ${names}.`);
  }
  return found;
}

function touch(c: Character): void {
  c.updatedAt = new Date().toISOString();
}

/** Dado de golpe, salvaciones, habilidad y tipo de lanzador de una clase, según el contenido. */
export function classDefaults(className: string): {
  hitDie: number; saves: AbilityKey[]; spellAbility?: AbilityKey; casterType?: string;
} {
  const entry = findEntry(className, "class");
  if (entry) {
    const d = entry.data as Record<string, unknown>;
    return {
      hitDie: (d["hitDie"] as number) ?? 8,
      saves: (d["saves"] as AbilityKey[]) ?? [],
      spellAbility: (d["spellcastingAbility"] as AbilityKey) ?? undefined,
      casterType: (d["casterType"] as string) ?? undefined,
    };
  }
  return { hitDie: 8, saves: [] };
}

/** Recalcula slots de conjuro (full/half/third caster; Pact Magic aparte). Preserva usos. */
export function recalcSlots(c: Character): void {
  const eff = effectiveCasterLevel(c);
  if (eff > 0) {
    const fresh = slotsForCasterLevel(eff);
    for (const [lvl, slot] of Object.entries(fresh)) {
      const prev = c.spellcasting.slots[lvl];
      slot.used = Math.min(prev?.used ?? 0, slot.max);
    }
    c.spellcasting.slots = fresh;
  }
  const warlock = c.classes.find((cl) => cl.name.toLowerCase() === "warlock");
  if (warlock) {
    const entry = findEntry("warlock", "class");
    const table = (entry?.data["pactSlots"] ?? {}) as Record<string, { count: number; level: number }>;
    let best = { count: 1, level: 1 };
    for (const [lvl, v] of Object.entries(table)) {
      if (warlock.level >= parseInt(lvl, 10)) best = v;
    }
    const prevUsed = c.spellcasting.pactSlots?.used ?? 0;
    c.spellcasting.pactSlots = { level: best.level, max: best.count, used: Math.min(prevUsed, best.count) };
  }
}

// ─── Operaciones ───

export function createCharacter(db: Database, input: CreateCharacterInput): Character {
  if (db.characters.some((c) => c.name.toLowerCase() === input.name.toLowerCase())) {
    throw new DomainError("conflict", `Ya existe un personaje llamado "${input.name}".`);
  }
  const level = input.level ?? 1;
  const speed = input.speed ?? 30;
  const def = classDefaults(input.className);
  const conMod = abilityMod(input.abilities.con);
  // PG: máximo del dado a nivel 1 + promedio por nivel adicional (regla estándar).
  const avg = Math.floor(def.hitDie / 2) + 1;
  const maxHp = Math.max(1, def.hitDie + conMod + (level - 1) * (avg + conMod));

  const cls: ClassLevel = { name: input.className, subclass: input.subclass, level, hitDie: def.hitDie };
  const now = new Date().toISOString();
  const c: Character = {
    id: newId("chr"),
    name: input.name,
    playerName: input.playerName,
    species: input.species,
    background: input.background,
    alignment: input.alignment,
    classes: [cls],
    abilities: input.abilities,
    hp: { max: maxHp, current: maxHp, temp: 0 },
    hitDice: [{ die: def.hitDie, total: level, used: 0 }],
    deathSaves: { successes: 0, failures: 0 },
    speed,
    acOverride: null,
    initiativeBonus: 0,
    proficiencies: {
      saves: def.saves,
      skills: input.skills ?? [],
      expertise: [],
      tools: [],
      languages: ["Common"],
      weapons: [],
      armor: [],
    },
    features: [],
    inventory: [],
    currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
    spellcasting: { ability: def.spellAbility, slots: {}, known: [], concentratingOn: null },
    conditions: [],
    effects: [],
    companions: [],
    style: { theme: "classic", layout: "classic", showPortrait: true },
    inspiration: false,
    appearance: input.appearance,
    backstory: input.backstory,
    xp: 0,
    createdAt: now,
    updatedAt: now,
  };
  recalcSlots(c);
  db.characters.push(c);
  return c;
}

export interface CharacterSummary {
  id: string; name: string; classes: string; level: number; species: string; hp: string;
}

export function listCharacters(db: Database): CharacterSummary[] {
  return db.characters.map((c) => ({
    id: c.id,
    name: c.name,
    classes: c.classes.map((cl) => `${cl.name} ${cl.level}`).join("/"),
    level: totalLevel(c),
    species: c.species,
    hp: `${c.hp.current}/${c.hp.max}${c.hp.temp ? ` (+${c.hp.temp} temp)` : ""}`,
  }));
}

export type CharacterView = "sheet" | "full" | "combat";

export function getCharacterView(c: Character, view: CharacterView = "sheet"): Record<string, unknown> {
  if (view === "full") return c as unknown as Record<string, unknown>;
  const sheet = computedSheet(c) as Record<string, unknown>;
  if (view === "combat") {
    return {
      name: sheet["name"], hp: sheet["hp"], ac: sheet["ac"], initiative: sheet["initiative"], speed: sheet["speed"],
      conditions: sheet["conditions"], effects: sheet["effects"], deathSaves: sheet["deathSaves"],
      spellcasting: sheet["spellcasting"], inspiration: sheet["inspiration"],
      companions: c.companions.map((k) => ({ id: k.id, name: k.name, hp: k.hp, ac: k.ac, conditions: k.conditions })),
    };
  }
  return sheet;
}

export function updateCharacter(c: Character, set: UpdateCharacterInput): Character {
  if (set.name !== undefined) c.name = set.name;
  if (set.species !== undefined) c.species = set.species;
  if (set.background !== undefined) c.background = set.background;
  if (set.alignment !== undefined) c.alignment = set.alignment;
  if (set.speed !== undefined) c.speed = set.speed;
  if (set.acOverride !== undefined) c.acOverride = set.acOverride;
  if (set.initiativeBonus !== undefined) c.initiativeBonus = set.initiativeBonus;
  if (set.inspiration !== undefined) c.inspiration = set.inspiration;
  if (set.xp !== undefined) c.xp = set.xp;
  if (set.appearance !== undefined) c.appearance = set.appearance;
  if (set.backstory !== undefined) c.backstory = set.backstory;
  if (set.notes !== undefined) c.notes = set.notes;
  if (set.abilities) Object.assign(c.abilities, set.abilities);
  const lower = (arr: string[]) => arr.map((s) => s.toLowerCase());
  if (set.addSkills) c.proficiencies.skills = [...new Set([...c.proficiencies.skills, ...set.addSkills])];
  if (set.removeSkills) c.proficiencies.skills = c.proficiencies.skills.filter((s) => !lower(set.removeSkills!).includes(s.toLowerCase()));
  if (set.addExpertise) c.proficiencies.expertise = [...new Set([...c.proficiencies.expertise, ...set.addExpertise])];
  if (set.addLanguages) c.proficiencies.languages = [...new Set([...c.proficiencies.languages, ...set.addLanguages])];
  if (set.addToolProficiencies) c.proficiencies.tools = [...new Set([...c.proficiencies.tools, ...set.addToolProficiencies])];
  if (set.addFeatures) {
    for (const f of set.addFeatures) {
      c.features.push({
        name: f.name,
        source: f.source ?? "Manual",
        description: f.description,
        uses: f.uses ? { max: f.uses.max, used: 0, recharge: f.uses.recharge ?? "long_rest" } : undefined,
      });
    }
  }
  if (set.removeFeatures) c.features = c.features.filter((f) => !lower(set.removeFeatures!).includes(f.name.toLowerCase()));
  if (set.spellcastingAbility !== undefined) c.spellcasting.ability = set.spellcastingAbility ?? undefined;
  touch(c);
  return c;
}

export function levelUp(c: Character, input: LevelUpInput): LevelUpResult {
  if (totalLevel(c) >= 20) throw new DomainError("rule", `${c.name} ya está a nivel 20 (máximo).`);

  let cls = input.className
    ? c.classes.find((x) => x.name.toLowerCase() === input.className!.toLowerCase())
    : c.classes[0];
  let isNewClass = false;
  if (!cls) {
    const def = classDefaults(input.className!);
    cls = { name: input.className!, level: 0, hitDie: def.hitDie };
    c.classes.push(cls);
    isNewClass = true; // multiclase: no añade salvaciones nuevas
  }
  cls.level += 1;
  if (input.subclass) cls.subclass = input.subclass;

  if (input.abilityIncreases) {
    for (const [k, v] of Object.entries(input.abilityIncreases)) {
      const key = k as AbilityKey;
      c.abilities[key] = Math.min(20, c.abilities[key] + (v ?? 0));
    }
  }

  if (input.hpRoll && input.hpRoll > cls.hitDie) {
    throw new DomainError("validation", `hpRoll ${input.hpRoll} excede el dado de golpe d${cls.hitDie} de ${cls.name}.`);
  }
  const conMod = abilityMod(c.abilities.con);
  const gain = Math.max(1, (input.hpRoll ?? Math.floor(cls.hitDie / 2) + 1) + conMod);
  c.hp.max += gain;
  c.hp.current += gain;

  let hd = c.hitDice.find((h) => h.die === cls!.hitDie);
  if (!hd) { hd = { die: cls.hitDie, total: 0, used: 0 }; c.hitDice.push(hd); }
  hd.total += 1;

  recalcSlots(c);
  touch(c);
  return {
    character: c,
    className: cls.name,
    classLevel: cls.level,
    levelTotal: totalLevel(c),
    hpGained: gain,
    isNewClass,
    subclass: input.subclass,
  };
}

export function deleteCharacter(db: Database, idOrName: string, confirm: boolean): { deleted: true; id: string; name: string } {
  if (!confirm) {
    throw new DomainError("validation", "Eliminación no confirmada. Envía confirm=true para borrar (irreversible).");
  }
  const c = requireCharacter(db, idOrName);
  db.characters = db.characters.filter((x) => x.id !== c.id);
  return { deleted: true, id: c.id, name: c.name };
}

export function exportCharacter(c: Character, format: "json" | "markdown" = "json"): { format: "json"; character: Character } | { format: "markdown"; markdown: string } {
  if (format === "json") return { format: "json", character: c };
  const s = computedSheet(c) as Record<string, unknown>;
  const ab = s["abilities"] as Record<string, { score: number; mod: number }>;
  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  const md = [
    `# ${c.name}`,
    `**${s["classes"]}** · ${c.species} · ${c.background}${c.alignment ? ` · ${c.alignment}` : ""}`,
    ``,
    `| FUE | DES | CON | INT | SAB | CAR |`,
    `|---|---|---|---|---|---|`,
    `| ${ab["str"].score} (${sign(ab["str"].mod)}) | ${ab["dex"].score} (${sign(ab["dex"].mod)}) | ${ab["con"].score} (${sign(ab["con"].mod)}) | ${ab["int"].score} (${sign(ab["int"].mod)}) | ${ab["wis"].score} (${sign(ab["wis"].mod)}) | ${ab["cha"].score} (${sign(ab["cha"].mod)}) |`,
    ``,
    `**CA** ${s["ac"]} (${s["acFormula"]}) · **PG** ${c.hp.current}/${c.hp.max} · **Velocidad** ${c.speed} ft · **Iniciativa** ${s["initiative"]} · **Percepción pasiva** ${s["passivePerception"]}`,
    ``,
    `**Habilidades con competencia:** ${c.proficiencies.skills.join(", ") || "—"}`,
    `**Rasgos:** ${c.features.map((f) => f.name).join(", ") || "—"}`,
    `**Inventario:** ${c.inventory.map((i) => `${i.name}${i.quantity > 1 ? ` x${i.quantity}` : ""}${i.equipped ? " (equipado)" : ""}`).join(", ") || "—"}`,
    c.spellcasting.known.length
      ? `**Hechizos:** ${c.spellcasting.known.map((sp) => `${sp.name}${sp.prepared || sp.alwaysPrepared ? "*" : ""}`).join(", ")} (* = preparado)`
      : "",
    c.companions.length ? `**Compañeros:** ${c.companions.map((k) => `${k.name} (${k.kind})`).join(", ")}` : "",
  ].filter(Boolean).join("\n");
  return { format: "markdown", markdown: md };
}

export function importCharacter(db: Database, raw: unknown): Character {
  const c = raw as Character;
  if (!c || !c.name || !c.classes || !c.abilities) {
    throw new DomainError("validation", "El JSON no parece un personaje válido: faltan name, classes o abilities.");
  }
  c.id = newId("chr");
  if (db.characters.some((x) => x.name.toLowerCase() === c.name.toLowerCase())) {
    c.name = `${c.name} (importado)`;
  }
  c.updatedAt = new Date().toISOString();
  db.characters.push(c);
  return c;
}

/** Clona un personaje existente (id nuevo, nombre "… (copia)"), independiente del original. */
export function duplicateCharacter(db: Database, idOrName: string): Character {
  const src = requireCharacter(db, idOrName);
  const copy = structuredClone(src);
  copy.id = newId("chr");
  copy.name = `${src.name} (copia)`;
  const now = new Date().toISOString();
  copy.createdAt = now;
  copy.updatedAt = now;
  db.characters.push(copy);
  return copy;
}
