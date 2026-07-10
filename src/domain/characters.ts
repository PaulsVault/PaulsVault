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
  // Dote de origen que otorga el trasfondo (nivel 1).
  const bg = findEntry(input.background, "background");
  const bgFeat = bg?.data["feat"] as string | undefined;
  if (bgFeat) {
    const fe = findEntry(bgFeat.replace(/\s*\(.*/, "").trim(), "feat");
    c.features.push({ name: bgFeat, source: "Trasfondo (dote de origen)", description: (fe?.data["summary"] as string | undefined) });
  }

  // Rasgos de clase por cada nivel y rasgos de subclase (si se eligió a nivel 3+).
  for (let l = 1; l <= level; l++) addClassFeatures(c, input.className, l);
  if (input.subclass && level >= 3) for (let l = 3; l <= level; l++) addSubclassFeatures(c, input.subclass, l);

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

  // Rasgos ganados en este nivel de clase y de subclase.
  addClassFeatures(c, cls.name, cls.level);
  if (cls.subclass) addSubclassFeatures(c, cls.subclass, cls.level);

  if (input.abilityIncreases) {
    for (const [k, v] of Object.entries(input.abilityIncreases)) {
      const key = k as AbilityKey;
      c.abilities[key] = Math.min(20, c.abilities[key] + (v ?? 0));
    }
  }

  if (input.feat) {
    const fe = findEntry(input.feat.replace(/\s*\(.*/, "").trim(), "feat");
    c.features.push({ name: input.feat, source: `Dote (nivel ${cls.level})`, description: (fe?.data["summary"] as string | undefined) });
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
