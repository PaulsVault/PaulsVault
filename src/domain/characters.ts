// Dominio de personajes: crear, listar, ver, actualizar, subir de nivel, borrar,
// exportar/importar y duplicar. Funciones sin I/O: reciben `db`/`character`, mutan y
// devuelven el resultado o lanzan DomainError. El adaptador (API) hace loadDb/saveDb.

import { allEntries, findEntry } from "./content.js";
import { DomainError } from "./errors.js";
import { multiclassProficiencies, type MulticlassProfs } from "./proficiency.js";
import { reconcileGrantedSpells } from "./spells.js";
import {
  abilityMod, computedSheet, effectiveCasterLevel, newId,
  proficiencyBonus, slotsForCasterLevel, totalLevel,
} from "../rules.js";
import type {
  AbilityKey, Abilities, Character, ClassLevel, Database, FeatureUses, JournalEntry, Personality,
} from "../types.js";

// ─── Tipos de entrada ───

export interface CreateCharacterInput {
  name: string;
  className: string;
  subclass?: string;
  level?: number;
  species: string;
  background: string;
  abilities: Abilities;            // puntuaciones base (antes del bono de trasfondo)
  abilityBonuses?: Partial<Abilities>; // +2/+1 del trasfondo (2024), a sumar sobre las base
  skills?: string[];               // habilidades elegidas de la clase
  tools?: string[];
  backgroundSkills?: string[];     // competencias de un trasfondo personalizado (elegidas a mano)
  originFeat?: string;             // dote de origen de un trasfondo personalizado
  featAbilities?: Partial<Abilities>; // media dote de origen: mejora de característica elegida
  ancestryChoices?: Record<string, string>; // ascendencia/linaje elegido por rasgo (trait → opción)
  speciesSkills?: string[];        // habilidad(es) elegidas de la especie (Human Skillful)
  speciesFeats?: { name: string; abilities?: Partial<Abilities> }[]; // dote(s) elegidas de la especie (Human Versatile)
  languages?: string[];            // idiomas del personaje (además de Común)
  options?: string[];              // elecciones de clase de nivel 1 (estilo de combate, etc.)
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
  personality?: Personality;
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
  feat?: string; // dote en vez de mejora de característica (niveles 4/8/12/16/19)
  featAbilities?: Partial<Abilities>; // media dote: mejora de característica elegida (Slasher/Sentinel…)
  skills?: string[]; // habilidad(es) elegidas al multiclasear (clases que la conceden)
  options?: string[]; // elecciones de clase (estilo de combate, invocaciones, metamagia…)
  resistances?: string[]; // tipo(s) de daño elegidos (afinidad dracónica): concede resistencia
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

/** Añade los rasgos de clase del nivel dado (keyFeatures del contenido), sin duplicar. */
export function addClassFeatures(c: Character, className: string, level: number): void {
  const entry = findEntry(className, "class");
  const kf = entry?.data["keyFeatures"] as Record<string, string[]> | undefined;
  for (const name of kf?.[String(level)] ?? []) {
    if (name === "Subclass" || name === "Subclase") continue; // placeholder: la subclase se elige aparte
    if (!c.features.some((f) => f.name === name)) {
      c.features.push({ name, source: `${className} nivel ${level}` });
    }
  }
}

/** Añade los rasgos de subclase del nivel dado (features del contenido), sin duplicar. */
export function addSubclassFeatures(c: Character, subclassName: string, level: number): void {
  const entry = findEntry(subclassName, "subclass");
  const feats = (entry?.data["features"] as { level: number; name: string; summary?: string }[] | undefined) ?? [];
  for (const f of feats) {
    if (f.level !== level || c.features.some((x) => x.name === f.name)) continue;
    c.features.push({ name: f.name, source: `${subclassName} nivel ${level}`, description: f.summary });
  }
}

/**
 * Añade una dote al personaje aplicando sus efectos "al tomarla" desde el contenido (homebrew u oficial):
 * bono a característica, competencias (habilidades/herramientas) y usos por descanso. Los efectos que van
 * a la hoja de forma continua (CA, salvaciones, ventaja…) los aplica el motor de modificadores por separado.
 */
export function applyFeat(c: Character, featName: string, source: string, chosenAbilities?: Partial<Abilities>): void {
  const d = findEntry(featName.replace(/\s*\(.*/, "").trim(), "feat")?.data as Record<string, unknown> | undefined;
  const uses = d?.["uses"] as { max: number; recharge?: FeatureUses["recharge"] } | undefined;
  c.features.push({
    name: featName,
    source,
    description: d?.["summary"] as string | undefined,
    uses: uses && uses.max > 0 ? { max: uses.max, used: 0, recharge: uses.recharge ?? "long_rest" } : undefined,
  });
  const bump = (map: Partial<Abilities> | undefined) => {
    if (map) for (const [k, v] of Object.entries(map)) c.abilities[k as AbilityKey] = Math.min(20, (c.abilities[k as AbilityKey] ?? 10) + (v ?? 0));
  };
  bump(d?.["abilityBonus"] as Partial<Abilities> | undefined); // mejora fija de la dote
  bump(chosenAbilities);                                       // media dote: mejora elegida por el jugador
  const skills = d?.["skills"] as string[] | undefined;
  if (skills?.length) c.proficiencies.skills = [...new Set([...c.proficiencies.skills, ...skills])];
  const tools = d?.["tools"] as string[] | undefined;
  if (tools?.length) c.proficiencies.tools = [...new Set([...c.proficiencies.tools, ...tools])];
}

/**
 * PG máximos extra que otorgan dotes (Tough: +2/nivel), rasgos de especie (Dureza Enana: +1/nivel)
 * y subclases (Resiliencia Dracónica: +1/nivel de clase). Función pura del estado actual; se usa para
 * bakear los PG al crear y para ajustar por diferencia al subir/bajar de nivel u otorgar dotes.
 */
export function bonusHitPoints(c: Character): number {
  let bonus = 0;
  const charLevel = totalLevel(c);
  const add = (data: Record<string, unknown> | undefined, level: number) => {
    if (!data) return;
    const per = data["hpPerLevel"];
    const flat = data["hpFlat"];
    if (typeof per === "number") bonus += per * level;
    if (typeof flat === "number") bonus += flat;
  };
  // Dotes (por nivel de personaje). Los rasgos de clase/subclase/ancestría no coinciden con una dote.
  for (const f of c.features) add(findEntry(f.name.replace(/\s*\(.*/, "").trim(), "feat")?.data as Record<string, unknown> | undefined, charLevel);
  // Especie (por nivel de personaje).
  add(findEntry(c.species, "species")?.data as Record<string, unknown> | undefined, charLevel);
  // Subclase (por nivel de esa clase; solo existe desde que se elige, así el total sale correcto).
  for (const cl of c.classes) if (cl.subclass) add(findEntry(cl.subclass, "subclass")?.data as Record<string, unknown> | undefined, cl.level);
  return bonus;
}

/** Ajusta PG máx/actuales por el cambio en el bono de PG (dotes/rasgos/subclases) respecto a `before`. */
function applyHpBonusDelta(c: Character, before: number): void {
  const delta = bonusHitPoints(c) - before;
  if (!delta) return;
  c.hp.max = Math.max(1, c.hp.max + delta);
  if (delta > 0) c.hp.current += delta;          // al subir el máximo, sube también el actual
  c.hp.current = Math.max(0, Math.min(c.hp.current, c.hp.max));
}

/** Otorga una dote a un personaje EN CUALQUIER MOMENTO (regalo/buff de campaña), aplicando sus efectos. */
export function grantFeat(c: Character, featName: string, source = "Regalo de campaña", chosenAbilities?: Partial<Abilities>): Character {
  const name = featName.trim();
  if (!name) throw new DomainError("validation", "Indica el nombre de la dote a otorgar.");
  if (c.features.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
    throw new DomainError("conflict", `${c.name} ya tiene "${name}".`);
  }
  const hpBefore = bonusHitPoints(c);
  applyFeat(c, findEntry(name.replace(/\s*\(.*/, "").trim(), "feat")?.name ?? name, source, chosenAbilities);
  applyHpBonusDelta(c, hpBefore); // p.ej. otorgar Tough como regalo sube los PG máximos
  touch(c);
  return c;
}

// ─── Operaciones ───

export function createCharacter(db: Database, input: CreateCharacterInput): Character {
  if (db.characters.some((c) => c.name.toLowerCase() === input.name.toLowerCase())) {
    throw new DomainError("conflict", `Ya existe un personaje llamado "${input.name}".`);
  }
  const level = input.level ?? 1;
  // Velocidad: la indicada, o la de la especie del contenido (Goliath 35, etc.), o 30.
  const speed = input.speed ?? (findEntry(input.species, "species")?.data["speed"] as number | undefined) ?? 30;
  const def = classDefaults(input.className);
  // Aplica el bono de característica del trasfondo (+2/+1 en 2024) sobre las puntuaciones base.
  const abilities: Abilities = { ...input.abilities };
  if (input.abilityBonuses) {
    for (const [k, v] of Object.entries(input.abilityBonuses)) {
      const key = k as AbilityKey;
      abilities[key] = (abilities[key] ?? 10) + (v ?? 0);
    }
  }
  const conMod = abilityMod(abilities.con);
  // PG: máximo del dado a nivel 1 + promedio por nivel adicional (regla estándar).
  const avg = Math.floor(def.hitDie / 2) + 1;
  const maxHp = Math.max(1, def.hitDie + conMod + (level - 1) * (avg + conMod));

  const cls: ClassLevel = { name: input.className, subclass: input.subclass, level, hitDie: def.hitDie };
  // Competencias de arma/armadura de la clase principal (2024). Se guardan para la hoja/exportación;
  // el motor también las recalcula en vivo (proficiency.ts), así los personajes previos también funcionan.
  const clsData = (findEntry(input.className, "class")?.data ?? {}) as Record<string, unknown>;
  const classArmor = (clsData["armor"] as string[] | undefined) ?? [];
  const classWeapons = (clsData["weapons"] as string[] | undefined) ?? [];
  const now = new Date().toISOString();
  const c: Character = {
    id: newId("chr"),
    name: input.name,
    playerName: input.playerName,
    species: input.species,
    background: input.background,
    alignment: input.alignment,
    classes: [cls],
    abilities,
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
      tools: input.tools ?? [],
      languages: input.languages && input.languages.length ? [...new Set(["Common", ...input.languages])] : ["Common"],
      weapons: classWeapons,
      armor: classArmor,
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
  // Dote de origen (nivel 1): del contenido del trasfondo, o la elegida a mano en un trasfondo personalizado.
  const bg = findEntry(input.background, "background");
  const bgFeat = (bg?.data["feat"] as string | undefined) ?? input.originFeat;
  if (bgFeat) applyFeat(c, bgFeat, "Trasfondo (dote de origen)", input.featAbilities);
  // Competencias del trasfondo: del contenido, o las elegidas a mano (personalizado). Se suman a las de clase.
  const bgSkills = (bg?.data["skills"] as string[] | undefined) ?? input.backgroundSkills ?? [];
  if (bgSkills.length) c.proficiencies.skills = [...new Set([...c.proficiencies.skills, ...bgSkills])];
  const bgTool = bg?.data["tool"] as string | undefined;
  if (bgTool) c.proficiencies.tools = [...new Set([...c.proficiencies.tools, bgTool])];

  // Ascendencia/linaje de la especie elegido (Giant Ancestry del Goliath, linaje del Elfo…) como rasgo.
  if (input.ancestryChoices) {
    const speciesData = findEntry(input.species, "species")?.data as Record<string, unknown> | undefined;
    const choices = (speciesData?.["ancestryChoices"] as { trait: string; usesPb?: boolean; options: { name: string; description: string; speed?: number }[] }[] | undefined) ?? [];
    for (const [trait, optName] of Object.entries(input.ancestryChoices)) {
      const ch = choices.find((x) => x.trait === trait);
      const opt = ch?.options.find((o) => o.name === optName);
      if (opt) {
        // Rasgo usable con cargas = bono de competencia por descanso largo (Ancestría de Gigante del Goliath).
        const uses = ch?.usesPb ? { max: proficiencyBonus(level), used: 0, recharge: "long_rest" as const, perProficiencyBonus: true } : undefined;
        c.features.push({ name: `${trait}: ${opt.name}`, source: "Especie (ascendencia)", description: opt.description || undefined, uses });
        // El linaje puede subir la velocidad base (Wood Elf → 35 ft).
        if (typeof opt.speed === "number" && opt.speed > c.speed) c.speed = opt.speed;
      }
    }
  }

  // Habilidades elegidas de la especie (Human Skillful) — se suman a las de clase/trasfondo.
  if (input.speciesSkills?.length) c.proficiencies.skills = [...new Set([...c.proficiencies.skills, ...input.speciesSkills])];
  // Dote(s) elegidas de la especie (Human Versatile: una dote de origen), con su media dote si aplica.
  for (const sf of input.speciesFeats ?? []) {
    if (!c.features.some((f) => f.name.toLowerCase() === sf.name.toLowerCase())) applyFeat(c, sf.name, "Especie (dote)", sf.abilities);
  }

  // Rasgos de clase por cada nivel y rasgos de subclase (si se eligió a nivel 3+).
  for (let l = 1; l <= level; l++) addClassFeatures(c, input.className, l);
  if (input.subclass && level >= 3) for (let l = 3; l <= level; l++) addSubclassFeatures(c, input.subclass, l);

  // Elecciones de clase de nivel 1 (estilo de combate del Guerrero, etc.).
  for (const name of input.options ?? []) {
    if (c.features.some((f) => f.name === name)) continue;
    const entry = findEntry(name);
    c.features.push({ name, source: `${input.className} nivel 1`, description: entry?.data["summary"] as string | undefined });
  }

  // PG extra por dotes/rasgos/subclase (Tough, Dureza Enana, Resiliencia Dracónica…) según el nivel.
  const hpBonus = bonusHitPoints(c);
  if (hpBonus) { c.hp.max += hpBonus; c.hp.current = c.hp.max; }

  recalcSlots(c);
  reconcileGrantedSpells(c); // conjuros otorgados por especie/subclase (Parte C)
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
  const hpBefore = bonusHitPoints(c); // por si cambian especie o rasgos con bono de PG
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
  if (set.personality) c.personality = { ...c.personality, ...set.personality };
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
  applyHpBonusDelta(c, hpBefore); // ajusta PG si cambió un rasgo/especie con bono de PG (p.ej. quitar un regalo)
  touch(c);
  return c;
}

// La tabla de competencias de multiclase vive en ./proficiency.js; se re-exporta para la API.
export { multiclassProficiencies };
export type { MulticlassProfs };

// ─── Elecciones de clase por nivel (estilo de combate, invocaciones, metamagia…) ───
interface ChoiceDef { kind: string; label: string; count: number; source: "feat" | "optionalfeature" | "literal"; match: string; note?: string; literalOptions?: ChoiceOption[]; }
// Tipos de daño de la Afinidad Elemental del Hechicero Dracónico (2024).
const DRACONIC_DAMAGE: ChoiceOption[] = ["Ácido", "Frío", "Fuego", "Relámpago", "Veneno"].map((name) => ({ name }));
export interface ChoiceOption { name: string; summary?: string; prerequisite?: string; }
export interface LevelChoice { kind: string; label: string; count: number; note?: string; options: ChoiceOption[]; }

const FIGHTING_STYLE: ChoiceDef = { kind: "fighting-style", label: "Estilo de combate", count: 1, source: "feat", match: "FS" };
const CHOICE_DEFS: Record<string, (level: number) => ChoiceDef[]> = {
  fighter: (l) => (l === 1 ? [FIGHTING_STYLE] : []),
  paladin: (l) => (l === 2 ? [FIGHTING_STYLE] : []),
  ranger: (l) => (l === 2 ? [FIGHTING_STYLE] : []),
  warlock: (l) => ([1, 2, 5, 7, 9, 12, 15, 18].includes(l)
    ? [{ kind: "invocation", label: "Invocaciones arcanas", count: l === 2 ? 2 : 1, source: "optionalfeature", match: "EI", note: "Solo aparecen las desbloqueadas a tu nivel. Elige la(s) que ganes ahora." }] : []),
  sorcerer: (l) => (l === 2 ? [{ kind: "metamagic", label: "Metamagia", count: 2, source: "optionalfeature", match: "MM" }]
    : [10, 17].includes(l) ? [{ kind: "metamagic", label: "Metamagia", count: 1, source: "optionalfeature", match: "MM" }] : []),
};

// Elecciones que dependen de la SUBCLASE (maniobras del Maestro de Batalla, etc.), no solo de la clase.
const SUBCLASS_CHOICE_DEFS: Record<string, (level: number) => ChoiceDef[]> = {
  "battle master": (l) => {
    const perLevel: Record<number, number> = { 3: 3, 7: 2, 10: 2, 15: 2 };
    return perLevel[l]
      ? [{ kind: "maneuver", label: "Maniobras (Maestro de Batalla)", count: perLevel[l], source: "optionalfeature", match: "MV:B", note: "Elige las maniobras que aprendes a este nivel." }]
      : [];
  },
  // Hechicero Dracónico: Afinidad Elemental (nivel 6) — elige el tipo de daño con el que tienes resistencia.
  "draconic sorcery": (l) => (l === 6
    ? [{ kind: "resistance", label: "Afinidad elemental (tipo de dragón)", count: 1, source: "literal", match: "", literalOptions: DRACONIC_DAMAGE, note: "Ganas resistencia a ese tipo de daño y sumas tu mod. de Carisma al daño de ese tipo." }]
    : []),
};

/** Nivel mínimo exigido por el prerequisito ("Nivel 5" → 5), o 0 si no exige nivel. */
function prereqLevel(prereq: string | undefined): number {
  const m = /Nivel\s+(\d+)/i.exec(prereq ?? "");
  return m ? Number(m[1]) : 0;
}

function resolveOptions(def: ChoiceDef, level: number): ChoiceOption[] {
  const seen = new Set<string>();
  const out: ChoiceOption[] = [];
  for (const e of allEntries()) {
    if (def.source === "feat" ? (e.type !== "feat" || e.data["category"] !== def.match)
      : (e.type !== "optionalfeature" || !(Array.isArray(e.data["featureType"]) && (e.data["featureType"] as string[]).includes(def.match)))) continue;
    if (seen.has(e.name.toLowerCase())) continue;
    const prerequisite = (e.data["prerequisite"] as string) ?? undefined;
    // Solo lo desbloqueado a este nivel (invocaciones "Nivel 5", etc.); sin prereq de nivel → siempre.
    if (prereqLevel(prerequisite) > level) continue;
    seen.add(e.name.toLowerCase());
    out.push({ name: e.name, summary: (e.data["summary"] as string) ?? undefined, prerequisite });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Elecciones (estilo de combate, invocaciones, maniobras, metamagia…) que concede una clase/subclase a un nivel. */
export function classChoicesAt(className: string, level: number, subclass?: string): LevelChoice[] {
  const defs = [
    ...(CHOICE_DEFS[className.toLowerCase()]?.(level) ?? []),
    ...(subclass ? SUBCLASS_CHOICE_DEFS[subclass.toLowerCase()]?.(level) ?? [] : []),
  ];
  return defs.map((d) => ({ kind: d.kind, label: d.label, count: d.count, note: d.note, options: d.source === "literal" ? (d.literalOptions ?? []) : resolveOptions(d, level) }));
}

export function levelUp(c: Character, input: LevelUpInput): LevelUpResult {
  if (totalLevel(c) >= 20) throw new DomainError("rule", `${c.name} ya está a nivel 20 (máximo).`);
  const hpBonusBefore = bonusHitPoints(c); // para sumar solo el incremento de PG por dotes/rasgos/subclase

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

  // Rasgos ganados en este nivel de clase y de subclase.
  addClassFeatures(c, cls.name, cls.level);
  if (cls.subclass) addSubclassFeatures(c, cls.subclass, cls.level);

  // Al MULTICLASEAR (primer nivel de una clase nueva): competencias reducidas del PHB 2024.
  if (isNewClass) {
    const mc = multiclassProficiencies(cls.name);
    if (mc.armor) c.proficiencies.armor = [...new Set([...c.proficiencies.armor, ...mc.armor])];
    if (mc.weapons) c.proficiencies.weapons = [...new Set([...c.proficiencies.weapons, ...mc.weapons])];
    if (mc.tools) c.proficiencies.tools = [...new Set([...c.proficiencies.tools, ...mc.tools])];
    if (mc.skillCount && input.skills?.length) {
      c.proficiencies.skills = [...new Set([...c.proficiencies.skills, ...input.skills.slice(0, mc.skillCount)])];
    }
  }

  // Elecciones de clase (estilo de combate, invocaciones, metamagia…) como rasgos.
  if (input.options?.length) {
    for (const name of input.options) {
      if (c.features.some((f) => f.name === name)) continue;
      const entry = findEntry(name);
      c.features.push({ name, source: `${cls.name} nivel ${cls.level}`, description: (entry?.data["summary"] as string | undefined) });
    }
  }

  // Resistencias elegidas (Afinidad Elemental del Hechicero Dracónico): resistencia + rasgo con nombre claro.
  if (input.resistances?.length) {
    c.resistances = [...new Set([...(c.resistances ?? []), ...input.resistances])];
    for (const dmg of input.resistances) {
      const fname = `Afinidad elemental (${dmg})`;
      if (!c.features.some((f) => f.name === fname)) {
        c.features.push({ name: fname, source: `${cls.name} nivel ${cls.level}`, description: `Resistencia a daño de tipo ${dmg}; sumas tu mod. de Carisma al daño de ese tipo.` });
      }
    }
  }

  if (input.abilityIncreases) {
    for (const [k, v] of Object.entries(input.abilityIncreases)) {
      const key = k as AbilityKey;
      c.abilities[key] = Math.min(20, c.abilities[key] + (v ?? 0));
    }
  }

  if (input.feat) applyFeat(c, input.feat, `Dote (nivel ${cls.level})`, input.featAbilities);

  if (input.hpRoll && input.hpRoll > cls.hitDie) {
    throw new DomainError("validation", `hpRoll ${input.hpRoll} excede el dado de golpe d${cls.hitDie} de ${cls.name}.`);
  }
  const conMod = abilityMod(c.abilities.con);
  const gain = Math.max(1, (input.hpRoll ?? Math.floor(cls.hitDie / 2) + 1) + conMod);
  c.hp.max += gain;
  c.hp.current += gain;

  // Incremento de PG por dotes/rasgos/subclase a este nivel (Tough +2, Dureza Enana +1, Resiliencia Dracónica…).
  const hpBonusDelta = bonusHitPoints(c) - hpBonusBefore;
  if (hpBonusDelta) { c.hp.max += hpBonusDelta; c.hp.current += hpBonusDelta; }

  let hd = c.hitDice.find((h) => h.die === cls!.hitDie);
  if (!hd) { hd = { die: cls.hitDie, total: 0, used: 0 }; c.hitDice.push(hd); }
  hd.total += 1;

  recalcSlots(c);
  reconcileGrantedSpells(c); // conjuros otorgados al nuevo nivel (Parte C)
  touch(c);
  return {
    character: c,
    className: cls.name,
    classLevel: cls.level,
    levelTotal: totalLevel(c),
    hpGained: gain + hpBonusDelta,
    isNewClass,
    subclass: input.subclass,
  };
}

export interface LevelDownResult {
  character: Character; className: string; classLevel: number; levelTotal: number; hpLost: number; classRemoved: boolean;
}

/** Baja un nivel (reverso de levelUp): quita PG (promedio), rasgos de clase/subclase/dote de ese nivel y el dado. */
export function levelDown(c: Character, className?: string): LevelDownResult {
  if (totalLevel(c) <= 1) throw new DomainError("rule", `${c.name} ya está a nivel 1 (mínimo).`);
  const cls = className
    ? c.classes.find((x) => x.name.toLowerCase() === className.toLowerCase())
    : c.classes[c.classes.length - 1];
  if (!cls) throw new DomainError("not_found", `${c.name} no tiene la clase "${className}".`);
  const oldLevel = cls.level;
  const hpBonusBefore = bonusHitPoints(c); // PG por dotes/rasgos/subclase antes de bajar

  // Quita los rasgos ganados en este nivel (clase, subclase y dote), identificados por su fuente.
  c.features = c.features.filter((f) => f.source !== `${cls.name} nivel ${oldLevel}`
    && (!cls.subclass || f.source !== `${cls.subclass} nivel ${oldLevel}`)
    && f.source !== `Dote (nivel ${oldLevel})`);

  // PG: reversa del promedio (dado/2+1 + mod CON).
  const conMod = abilityMod(c.abilities.con);
  const hpLost = Math.max(1, Math.floor(cls.hitDie / 2) + 1 + conMod);
  c.hp.max = Math.max(1, c.hp.max - hpLost);
  c.hp.current = Math.min(c.hp.current, c.hp.max);

  const hd = c.hitDice.find((h) => h.die === cls.hitDie);
  if (hd) { hd.total = Math.max(0, hd.total - 1); hd.used = Math.min(hd.used, hd.total); }

  cls.level -= 1;

  // Al bajar de nivel 3 se pierde la subclase y todos sus rasgos.
  if (cls.subclass && cls.level < 3) {
    const sub = cls.subclass;
    c.features = c.features.filter((f) => !f.source.startsWith(`${sub} nivel`));
    cls.subclass = undefined;
  }

  let classRemoved = false;
  if (cls.level <= 0) {
    c.classes = c.classes.filter((x) => x !== cls);
    if (hd && hd.total <= 0) c.hitDice = c.hitDice.filter((h) => h !== hd);
    classRemoved = true;
  }

  // Baja también los PG por dotes/rasgos/subclase que se pierden a este nivel (delta negativo).
  const hpBonusDelta = bonusHitPoints(c) - hpBonusBefore;
  if (hpBonusDelta) { c.hp.max = Math.max(1, c.hp.max + hpBonusDelta); c.hp.current = Math.min(c.hp.current, c.hp.max); }

  recalcSlots(c);
  reconcileGrantedSpells(c); // quita los conjuros otorgados por encima del nuevo nivel (Parte C)
  touch(c);
  return { character: c, className: cls.name, classLevel: cls.level, levelTotal: totalLevel(c), hpLost: hpLost - hpBonusDelta, classRemoved };
}

// ─── Diario de campaña/sesión ───

export interface JournalInput { date?: string; title?: string; campaign?: string; body: string; }

export function addJournalEntry(c: Character, input: JournalInput): JournalEntry {
  if (!input.body?.trim()) throw new DomainError("validation", "La entrada del diario no puede estar vacía.");
  const entry: JournalEntry = {
    id: newId("jrn"),
    date: input.date?.trim() || new Date().toISOString().slice(0, 10),
    title: input.title?.trim() || undefined,
    campaign: input.campaign?.trim() || undefined,
    body: input.body.trim(),
    createdAt: new Date().toISOString(),
  };
  c.journal = [...(c.journal ?? []), entry];
  touch(c);
  return entry;
}

export function updateJournalEntry(c: Character, entryId: string, set: Partial<JournalInput>): JournalEntry {
  const e = (c.journal ?? []).find((x) => x.id === entryId);
  if (!e) throw new DomainError("not_found", `Entrada de diario "${entryId}" no encontrada.`);
  if (set.date !== undefined && set.date.trim()) e.date = set.date.trim();
  if (set.title !== undefined) e.title = set.title.trim() || undefined;
  if (set.campaign !== undefined) e.campaign = set.campaign.trim() || undefined;
  if (set.body !== undefined && set.body.trim()) e.body = set.body.trim();
  touch(c);
  return e;
}

export function deleteJournalEntry(c: Character, entryId: string): { deleted: true; id: string } {
  const before = (c.journal ?? []).length;
  c.journal = (c.journal ?? []).filter((x) => x.id !== entryId);
  if (c.journal.length === before) throw new DomainError("not_found", `Entrada de diario "${entryId}" no encontrada.`);
  touch(c);
  return { deleted: true, id: entryId };
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
