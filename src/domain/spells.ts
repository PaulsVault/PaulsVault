// Dominio de hechizos: aprender, olvidar, preparar, lanzar y ajustar slots.
// Lanzar valida upcasting, consume slot (normal/pacto/ninguno) y gestiona concentración.

import { findEntry } from "./content.js";
import { DomainError } from "./errors.js";
import { armorPenalty } from "./proficiency.js";
import { newId, spellStats, totalLevel } from "../rules.js";
import type { AbilityKey, Character, KnownSpell } from "../types.js";

// ─── Extracción de mecánicas del texto del conjuro (salvación, daño, área) ───

// El SRD viene en dos packs: srd-core (resúmenes en español abreviado) y
// srd-52-reference (prosa en inglés). El parser entiende ambos idiomas.
const ABILITY_BY_NAME: Record<string, string> = {
  strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha",
  fue: "str", des: "dex", con: "con", int: "int", sab: "wis", car: "cha",
  fuerza: "str", destreza: "dex", "constitución": "con", constitucion: "con",
  inteligencia: "int", "sabiduría": "wis", sabiduria: "wis", carisma: "cha",
};
const TYPE_MAP: Record<string, string> = {
  acid: "Ácido", bludgeoning: "Contundente", cold: "Frío", fire: "Fuego", force: "Fuerza",
  lightning: "Relámpago", necrotic: "Necrótico", piercing: "Perforante", poison: "Veneno",
  psychic: "Psíquico", radiant: "Radiante", slashing: "Cortante", thunder: "Trueno",
  "ácido": "Ácido", acido: "Ácido", contundente: "Contundente", "frío": "Frío", frio: "Frío",
  fuego: "Fuego", "relámpago": "Relámpago", relampago: "Relámpago", rayo: "Relámpago",
  "necrótico": "Necrótico", necrotico: "Necrótico", perforante: "Perforante", veneno: "Veneno",
  "psíquico": "Psíquico", psiquico: "Psíquico", radiante: "Radiante", cortante: "Cortante", trueno: "Trueno",
};
const SHAPE_MAP: Record<string, string> = {
  sphere: "sphere", cone: "cone", cube: "cube", line: "line", cylinder: "cylinder", emanation: "emanation",
  esfera: "sphere", cono: "cone", cubo: "cube", "línea": "line", linea: "line",
  cilindro: "cylinder", "emanación": "emanation", "emanacion": "emanation",
};
const SHAPE_LABEL: Record<string, string> = {
  sphere: "Esfera", cone: "Cono", cube: "Cubo", line: "Línea", cylinder: "Cilindro", emanation: "Emanación",
};

export interface SpellMechanics {
  kind?: "damage" | "heal"; // qué representan los dados
  save?: string;            // característica de salvación del objetivo: "dex", "con"…
  attack?: boolean;         // requiere tirada de ataque de conjuro
  damage?: string;          // dados ajustados al nivel lanzado, p.ej. "10d6"
  baseDamage?: string;      // dados base sin upcasting
  damageType?: string;      // "Fuego", "Frío"…
  range?: string;           // alcance (dato estructurado del conjuro)
  shape?: string;           // "sphere" | "cone" | "cube" | "line" | "cylinder" | "emanation"
  areaSize?: number;        // tamaño del área en pies
  area?: string;            // etiqueta legible, p.ej. "20 ft Esfera"
}

/** Extrae salvación, daño/curación (con upcasting), tipo y área del resumen (ES/EN) del conjuro. */
export function spellMechanics(data: Record<string, unknown>, castAt?: number, spellLevel?: number): SpellMechanics {
  const summary = String(data["summary"] ?? "");
  const m: SpellMechanics = {};
  if (data["range"]) m.range = String(data["range"]);

  const save = summary.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw/i)
    ?? summary.match(/salvaci[óo]n\s+(?:de\s+)?(FUE|DES|CON|INT|SAB|CAR|Fuerza|Destreza|Constituci[óo]n|Inteligencia|Sabidur[íi]a|Carisma)/i);
  if (save) m.save = ABILITY_BY_NAME[save[1].toLowerCase()];
  if (/spell attack|ataque de conjuro/i.test(summary)) m.attack = true;

  // Tipo de daño: inglés "X damage", español "NdM(+N) de X" o "daño X".
  const enT = summary.match(/\b(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder)\s+damage/i);
  const esT = summary.match(/\d+d\d+(?:\s*[+\-]\s*\d+)?\s+de\s+([a-záéíóú]+)/i) ?? summary.match(/da[ñn]o\s+(?:de\s+)?([a-záéíóú]+)/i);
  const typeWord = (enT?.[1] ?? esT?.[1])?.toLowerCase();
  if (typeWord && TYPE_MAP[typeWord]) m.damageType = TYPE_MAP[typeWord];

  const heal = /\b(regains?|hit points|healing)\b/i.test(summary) || /\bcura\b|curaci[óo]n|recupera|puntos de golpe|\bPG\b/i.test(summary);

  const dice = summary.match(/(\d+)d(\d+)/);
  if (dice) {
    const faces = Number(dice[2]);
    let count = Number(dice[1]);
    m.baseDamage = `${count}d${faces}`;
    m.kind = m.damageType ? "damage" : heal ? "heal" : "damage";
    const up = summary.match(/increases by (\d+)d(\d+)/i) ?? summary.match(/\+\s*(\d+)d(\d+)\s+por nivel/i);
    if (up && castAt !== undefined && spellLevel !== undefined && castAt > spellLevel && Number(up[2]) === faces) {
      count += Number(up[1]) * (castAt - spellLevel);
    }
    m.damage = `${count}d${faces}`;
  }

  // Área: inglés "20-foot-radius Sphere" / "60-foot Cone"; español "Esfera de 20 ft".
  const enA = summary.match(/(\d+)-foot(?:-radius)?\s+(Sphere|Cone|Cube|Line|Cylinder|Emanation)/i);
  const esA = summary.match(/(Esfera|Cono|Cubo|L[íi]nea|Cilindro|Emanaci[óo]n)\s+de\s+(\d+)/i);
  const enR = summary.match(/(\d+)-foot radius/i);
  if (enA) { m.areaSize = Number(enA[1]); m.shape = SHAPE_MAP[enA[2].toLowerCase()]; }
  else if (esA) { m.areaSize = Number(esA[2]); m.shape = SHAPE_MAP[esA[1].toLowerCase()]; }
  else if (enR) { m.areaSize = Number(enR[1]); m.shape = "sphere"; }
  if (m.shape && m.areaSize) m.area = `${m.areaSize} ft · ${SHAPE_LABEL[m.shape]}`;

  return m;
}

/** Escala el daño de un truco al nivel de personaje (2024: +1 dado al llegar a niveles 5, 11 y 17). */
export function scaleCantripDamage(baseDamage: string, charLevel: number): string {
  const m = baseDamage.match(/(\d+)d(\d+)/);
  if (!m) return baseDamage;
  const count = parseInt(m[1], 10);
  const tiers = (charLevel >= 5 ? 1 : 0) + (charLevel >= 11 ? 1 : 0) + (charLevel >= 17 ? 1 : 0);
  return `${count + tiers}d${m[2]}${baseDamage.slice(m[0].length)}`; // conserva un posible "+N"
}

export function spellcastingView(c: Character): Record<string, unknown> {
  const sc = c.spellcasting;
  const stats = spellStats(c);
  return {
    ability: sc.ability ?? null,
    saveDC: stats?.dc ?? null,
    attackBonus: stats?.attack ?? null,
    slots: sc.slots,
    pactSlots: sc.pactSlots ?? null,
    concentratingOn: sc.concentratingOn ?? null,
    grantedChoices: grantedSpellChoiceNotes(c),
    spells: sc.known.map((s) => ({
      name: s.name, level: s.level,
      prepared: s.prepared || s.alwaysPrepared,
      ...(s.alwaysPrepared ? { alwaysPrepared: true } : {}),
      ...(s.concentration ? { concentration: true } : {}),
      source: s.source,
      summary: (findEntry(s.name, "spell")?.data["summary"] as string | undefined) ?? undefined,
      mechanics: spellMechanics((findEntry(s.name, "spell")?.data ?? {}) as Record<string, unknown>),
    })),
  };
}

function findKnown(c: Character, name: string): KnownSpell | undefined {
  return c.spellcasting.known.find((s) => s.name.toLowerCase() === name.toLowerCase());
}

export function learnSpell(c: Character, spell: string, level?: number, alwaysPrepared = false): KnownSpell {
  const content = findEntry(spell, "spell");
  const cd = (content?.data ?? {}) as Record<string, unknown>;
  const name = content?.name ?? spell;
  if (findKnown(c, name)) throw new DomainError("conflict", `${c.name} ya conoce ${name}.`);
  const lvl = level ?? (cd["level"] as number | undefined);
  if (lvl === undefined) {
    throw new DomainError("validation", `Hechizo "${spell}" no está en el contenido instalado; indica su nivel (0 = truco) o impórtalo con un content pack.`);
  }
  const learned: KnownSpell = {
    name,
    level: lvl,
    prepared: lvl === 0,
    alwaysPrepared: alwaysPrepared || lvl === 0,
    source: c.classes[0]?.name ?? "Manual",
    concentration: (cd["concentration"] as boolean) ?? false,
    ritual: (cd["ritual"] as boolean) ?? false,
  };
  c.spellcasting.known.push(learned);
  return learned;
}

export function forgetSpell(c: Character, spell: string): void {
  const known = findKnown(c, spell);
  if (!known) throw new DomainError("not_found", `${c.name} no conoce "${spell}".`);
  c.spellcasting.known = c.spellcasting.known.filter((s) => s !== known);
}

export function prepareSpell(c: Character, spell: string): KnownSpell {
  const known = findKnown(c, spell);
  if (!known) throw new DomainError("not_found", `${c.name} no conoce "${spell}". Apréndelo primero.`);
  known.prepared = true;
  return known;
}

export function unprepareSpell(c: Character, spell: string): KnownSpell {
  const known = findKnown(c, spell);
  if (!known) throw new DomainError("not_found", `${c.name} no conoce "${spell}".`);
  if (known.alwaysPrepared) throw new DomainError("rule", `${known.name} está siempre preparado (${known.source}); no se puede despreparar.`);
  known.prepared = false;
  return known;
}

// ─── Conjuros otorgados automáticamente por raza/subclase (Parte C) ───
const GRANT_PREFIX = "Otorgado: ";

/**
 * Sincroniza los conjuros otorgados por la especie (nivel de personaje) y las subclases (nivel de clase):
 * los "siempre preparados/conocidos" fijos del contenido (grantedSpells). Idempotente: recalcula desde cero,
 * así funciona al crear, subir y bajar de nivel. No pisa los conjuros aprendidos manualmente (por nombre).
 */
export function reconcileGrantedSpells(c: Character): void {
  c.spellcasting.known = c.spellcasting.known.filter((s) => !s.source.startsWith(GRANT_PREFIX));

  const targets: { name: string; source: string }[] = [];
  let grantedAbility: AbilityKey | undefined;
  const addFrom = (data: Record<string, unknown> | undefined, availLevel: number, granter: string) => {
    for (const x of (data?.["grantedSpells"] as { level: number; name: string }[] | undefined) ?? []) {
      if (x.level <= availLevel) targets.push({ name: x.name, source: GRANT_PREFIX + granter });
    }
    const ab = data?.["grantedSpellAbility"] as AbilityKey | undefined;
    if (ab && !grantedAbility) grantedAbility = ab;
  };

  addFrom(findEntry(c.species, "species")?.data, totalLevel(c), c.species);
  for (const cl of c.classes) if (cl.subclass) addFrom(findEntry(cl.subclass, "subclass")?.data, cl.level, cl.subclass);

  for (const t of targets) {
    if (c.spellcasting.known.some((s) => s.name.toLowerCase() === t.name.toLowerCase())) continue;
    const cd = findEntry(t.name, "spell")?.data as Record<string, unknown> | undefined;
    c.spellcasting.known.push({
      name: (cd?.["name"] as string) ?? findEntry(t.name, "spell")?.name ?? t.name,
      level: (cd?.["level"] as number | undefined) ?? 0,
      prepared: true,
      alwaysPrepared: true,
      source: t.source,
      concentration: (cd?.["concentration"] as boolean) ?? false,
      ritual: (cd?.["ritual"] as boolean) ?? false,
    });
  }

  // Un personaje no lanzador que recibe conjuros (p. ej. truco racial) obtiene una habilidad de lanzamiento.
  if (!c.spellcasting.ability && grantedAbility && c.spellcasting.known.length) c.spellcasting.ability = grantedAbility;
}

/** Elecciones de conjuros pendientes (linaje del Elfo, tierra del Druida…) para avisar en la UI. */
export function grantedSpellChoiceNotes(c: Character): string[] {
  const notes: string[] = [];
  const add = (data: Record<string, unknown> | undefined, availLevel: number, granter: string) => {
    for (const x of (data?.["grantedSpellChoices"] as { level: number }[] | undefined) ?? []) {
      if (x.level <= availLevel) notes.push(`${granter}: elige tu(s) conjuro(s) de este rasgo y añádelos a mano.`);
    }
  };
  add(findEntry(c.species, "species")?.data, totalLevel(c), c.species);
  for (const cl of c.classes) if (cl.subclass) add(findEntry(cl.subclass, "subclass")?.data, cl.level, cl.subclass);
  return [...new Set(notes)];
}

export interface CastSpellInput {
  spell: string;
  level?: number;        // nivel del slot usado (permite upcasting)
  usePactSlot?: boolean;
  noSlot?: boolean;      // ritual / objeto / truco concedido
  durationRounds?: number;
}

export interface CastResult {
  spell: string;
  spellLevel: number;
  castAt: number;
  upcast: boolean;
  concentration: boolean;
  concentrationBroken?: string;
  saveDC: number | null;
  attackBonus: number | null;
  summary?: string;
  mechanics?: SpellMechanics;
}

export function castSpell(c: Character, input: CastSpellInput): CastResult {
  // Armadura/escudo sin competencia equipado → no puedes lanzar conjuros (2024).
  const armor = armorPenalty(c);
  if (armor.active) {
    throw new DomainError("rule", `No puedes lanzar conjuros con ${armor.items.join(", ")} equipado (sin competencia con esa armadura). Quítatelo primero.`);
  }
  const sc = c.spellcasting;
  const stats = spellStats(c);
  const content = findEntry(input.spell, "spell");
  const cd = (content?.data ?? {}) as Record<string, unknown>;
  const known = findKnown(c, content?.name ?? input.spell);

  const spellLevel = known?.level ?? (cd["level"] as number | undefined) ?? input.level;
  if (spellLevel === undefined) {
    throw new DomainError("validation", `No sé el nivel de "${input.spell}". Indícalo o aprende el hechizo primero.`);
  }
  const castAt = input.level ?? spellLevel;
  if (castAt < spellLevel) {
    throw new DomainError("rule", `No puedes lanzar ${input.spell} (nivel ${spellLevel}) con un slot de nivel ${castAt}.`);
  }

  if (spellLevel > 0 && !input.noSlot) {
    if (input.usePactSlot) {
      if (!sc.pactSlots) throw new DomainError("rule", `${c.name} no tiene slots de pacto (no es Warlock).`);
      if (sc.pactSlots.used >= sc.pactSlots.max) throw new DomainError("rule", `Sin slots de pacto disponibles (${sc.pactSlots.used}/${sc.pactSlots.max}). Se recuperan con descanso corto.`);
      sc.pactSlots.used += 1;
    } else {
      const slot = sc.slots[String(castAt)];
      if (!slot || slot.max === 0) throw new DomainError("rule", `${c.name} no tiene slots de nivel ${castAt}.`);
      if (slot.used >= slot.max) throw new DomainError("rule", `Sin slots de nivel ${castAt} (${slot.used}/${slot.max}). Usa otro nivel, un slot de pacto, o descansa.`);
      slot.used += 1;
    }
  }

  const isConc = known?.concentration ?? (cd["concentration"] as boolean) ?? false;
  const castName = known?.name ?? content?.name ?? input.spell;
  let concentrationBroken: string | undefined;
  if (isConc) {
    if (sc.concentratingOn) {
      c.effects = c.effects.filter((e) => !(e.concentration && e.name === sc.concentratingOn));
      concentrationBroken = sc.concentratingOn;
    }
    sc.concentratingOn = castName;
    c.effects.push({
      id: newId("eff"),
      name: castName,
      description: (cd["summary"] as string) ?? "Efecto de conjuro con concentración",
      roundsRemaining: input.durationRounds ?? null,
      minutesRemaining: null,
      concentration: true,
      source: `Lanzado a nivel ${castAt}`,
      appliesTo: "self",
    });
  } else if (input.durationRounds) {
    c.effects.push({
      id: newId("eff"),
      name: castName,
      description: (cd["summary"] as string) ?? undefined,
      roundsRemaining: input.durationRounds,
      minutesRemaining: null,
      concentration: false,
      source: `Lanzado a nivel ${castAt}`,
      appliesTo: "self",
    });
  }

  return {
    spell: castName,
    spellLevel,
    castAt,
    upcast: castAt > spellLevel,
    concentration: isConc,
    concentrationBroken,
    saveDC: stats?.dc ?? null,
    attackBonus: stats?.attack ?? null,
    summary: (cd["summary"] as string) ?? undefined,
    mechanics: spellMechanics(cd, castAt, spellLevel),
  };
}

// ─── Slots manuales ───

export function setMaxSlots(c: Character, slots: Record<string, number>): void {
  for (const [lvl, max] of Object.entries(slots)) {
    const prev = c.spellcasting.slots[lvl];
    c.spellcasting.slots[lvl] = { max, used: Math.min(prev?.used ?? 0, max) };
  }
}

export function spendSlot(c: Character, level: number, amount = 1): void {
  const slot = c.spellcasting.slots[String(level)];
  if (!slot) throw new DomainError("not_found", `${c.name} no tiene slots de nivel ${level}.`);
  slot.used = Math.min(slot.max, slot.used + amount);
}

export function recoverSlot(c: Character, level: number, amount = 1): void {
  const slot = c.spellcasting.slots[String(level)];
  if (!slot) throw new DomainError("not_found", `${c.name} no tiene slots de nivel ${level}.`);
  slot.used = Math.max(0, slot.used - amount);
}

export function recoverAllSlots(c: Character): void {
  for (const slot of Object.values(c.spellcasting.slots)) slot.used = 0;
  if (c.spellcasting.pactSlots) c.spellcasting.pactSlots.used = 0;
}
