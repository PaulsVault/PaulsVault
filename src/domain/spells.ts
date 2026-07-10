// Dominio de hechizos: aprender, olvidar, preparar, lanzar y ajustar slots.
// Lanzar valida upcasting, consume slot (normal/pacto/ninguno) y gestiona concentración.

import { findEntry } from "./content.js";
import { DomainError } from "./errors.js";
import { newId, spellStats } from "../rules.js";
import type { Character, KnownSpell } from "../types.js";

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
    spells: sc.known.map((s) => ({
      name: s.name, level: s.level,
      prepared: s.prepared || s.alwaysPrepared,
      ...(s.alwaysPrepared ? { alwaysPrepared: true } : {}),
      ...(s.concentration ? { concentration: true } : {}),
      source: s.source,
      summary: (findEntry(s.name, "spell")?.data["summary"] as string | undefined) ?? undefined,
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
}

export function castSpell(c: Character, input: CastSpellInput): CastResult {
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
