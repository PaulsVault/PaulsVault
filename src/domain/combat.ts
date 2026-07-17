// Dominio de combate: PG/daño/curación/muerte, condiciones, efectos con duración y descansos.
// Funciones sin I/O sobre `character`. Las condiciones incapacitantes rompen la concentración.

import { findEntry } from "./content.js";
import { DomainError } from "./errors.js";
import { rechargeItemsOnRest } from "./inventory.js";
import { abilityMod, newId, proficiencyBonus, totalLevel } from "../rules.js";
import type { ActiveCondition, Character, Companion, Feature } from "../types.js";

const INCAPACITATING = ["incapacitated", "paralyzed", "petrified", "stunned", "unconscious"];

/** Máximo efectivo de usos de un rasgo (PB actual si sus usos son "= bono de competencia"). */
export function effectiveFeatureMax(c: Character, f: Feature): number {
  if (!f.uses) return 0;
  return f.uses.perProficiencyBonus ? proficiencyBonus(totalLevel(c)) : f.uses.max;
}

/** Gasta (delta +1) o restaura (delta -1) un uso de un rasgo con cargas; respeta 0..máximo. */
export function adjustFeatureUse(c: Character, featureName: string, delta: number): Feature {
  const f = c.features.find((x) => x.name.toLowerCase() === featureName.toLowerCase());
  if (!f?.uses) throw new DomainError("not_found", `El rasgo "${featureName}" no tiene cargas.`);
  const max = effectiveFeatureMax(c, f);
  f.uses.used = Math.max(0, Math.min(max, f.uses.used + delta));
  c.updatedAt = new Date().toISOString();
  return f;
}

/** Rompe la concentración del personaje (si la hay) y elimina su efecto. Devuelve el nombre roto o "". */
export function breakConcentration(c: Character): string {
  if (!c.spellcasting.concentratingOn) return "";
  const name = c.spellcasting.concentratingOn;
  c.effects = c.effects.filter((e) => !(e.concentration && e.name === name));
  c.spellcasting.concentratingOn = null;
  return name;
}

export function combatView(c: Character): Record<string, unknown> {
  return {
    name: c.name,
    hp: c.hp,
    deathSaves: c.deathSaves,
    conditions: c.conditions,
    effects: c.effects.map((e) => ({
      id: e.id, name: e.name,
      roundsRemaining: e.roundsRemaining ?? null,
      concentration: e.concentration,
      ...(e.appliesTo === "companion" ? { companion: c.companions.find((k) => k.id === e.companionId)?.name } : {}),
    })),
    concentratingOn: c.spellcasting.concentratingOn ?? null,
  };
}

// ─── PG, daño, curación y muerte ───

export interface DamageResult {
  hpCurrent: number;
  tempAbsorbed: number;
  downed: boolean;
  massiveDeath: boolean;
  concentrationSaveDC?: number;
  deathSaveFailAdded: boolean;
  concentrationBroken?: string;
}

export function applyDamage(c: Character, amount: number): DamageResult {
  let dmg = amount;
  let tempAbsorbed = 0;
  if (c.hp.temp > 0) {
    tempAbsorbed = Math.min(c.hp.temp, dmg);
    c.hp.temp -= tempAbsorbed;
    dmg -= tempAbsorbed;
  }
  const before = c.hp.current;
  c.hp.current = Math.max(0, before - dmg);

  const result: DamageResult = {
    hpCurrent: c.hp.current, tempAbsorbed, downed: false, massiveDeath: false, deathSaveFailAdded: false,
  };
  if (c.spellcasting.concentratingOn && amount > 0) {
    result.concentrationSaveDC = Math.max(10, Math.floor(amount / 2));
  }
  if (before > 0 && c.hp.current === 0) {
    const overflow = dmg - before;
    if (overflow >= c.hp.max) {
      result.massiveDeath = true;
    } else {
      if (!c.conditions.some((x) => x.name.toLowerCase() === "unconscious")) {
        c.conditions.push({ name: "Unconscious", source: "0 PG" });
      }
      result.downed = true;
      const broken = breakConcentration(c);
      if (broken) result.concentrationBroken = broken;
    }
  } else if (c.hp.current === 0 && before === 0) {
    c.deathSaves.failures = Math.min(3, c.deathSaves.failures + 1);
    result.deathSaveFailAdded = true;
  }
  return result;
}

export function heal(c: Character, amount: number): { hpCurrent: number; revived: boolean } {
  const wasDown = c.hp.current === 0;
  c.hp.current = Math.min(c.hp.max, c.hp.current + amount);
  let revived = false;
  if (wasDown && c.hp.current > 0) {
    c.conditions = c.conditions.filter((x) => x.name.toLowerCase() !== "unconscious");
    c.deathSaves = { successes: 0, failures: 0 };
    revived = true;
  }
  return { hpCurrent: c.hp.current, revived };
}

export function setTempHp(c: Character, amount: number): { temp: number; replaced: boolean } {
  if (amount > c.hp.temp) { c.hp.temp = amount; return { temp: c.hp.temp, replaced: true }; }
  return { temp: c.hp.temp, replaced: false };
}

export function setMaxHp(c: Character, amount: number): void {
  c.hp.max = amount;
  c.hp.current = Math.min(c.hp.current, amount);
}

export type DeathSaveResult = "success" | "failure" | "critical" | "fumble";

export function deathSave(c: Character, result: DeathSaveResult): { deathSaves: Character["deathSaves"]; revived: boolean; stable: boolean; dead: boolean } {
  let revived = false, stable = false, dead = false;
  if (result === "critical") {
    c.hp.current = 1;
    c.deathSaves = { successes: 0, failures: 0 };
    c.conditions = c.conditions.filter((x) => x.name.toLowerCase() !== "unconscious");
    revived = true;
  } else if (result === "fumble") {
    c.deathSaves.failures = Math.min(3, c.deathSaves.failures + 2);
  } else if (result === "success") {
    c.deathSaves.successes = Math.min(3, c.deathSaves.successes + 1);
    if (c.deathSaves.successes >= 3) stable = true;
  } else {
    c.deathSaves.failures = Math.min(3, c.deathSaves.failures + 1);
  }
  if (c.deathSaves.failures >= 3) dead = true;
  return { deathSaves: c.deathSaves, revived, stable, dead };
}

export function stabilize(c: Character): void {
  c.deathSaves = { successes: 0, failures: 0 };
}

export function resetDeathSaves(c: Character): void {
  c.deathSaves = { successes: 0, failures: 0 };
}

// ─── Condiciones ───

function findCompanion(c: Character, name: string): Companion | undefined {
  return c.companions.find((k) => k.name.toLowerCase().includes(name.toLowerCase()));
}

export interface ConditionOptions { level?: number; source?: string; companion?: string; }

export function applyCondition(c: Character, condition: string, opts: ConditionOptions = {}): { target: string; conditions: ActiveCondition[]; rules?: string; broke?: string } {
  const target = opts.companion ? findCompanion(c, opts.companion) : null;
  if (opts.companion && !target) throw new DomainError("not_found", `Compañero "${opts.companion}" no encontrado.`);
  const list = target ? target.conditions : c.conditions;
  const holder = target ? target.name : c.name;

  const entry = findEntry(condition, "condition");
  const name = entry?.name ?? condition;
  const existing = list.find((x) => x.name.toLowerCase() === name.toLowerCase());
  const isExhaustion = name.toLowerCase() === "exhaustion";
  let broke: string | undefined;

  if (existing && isExhaustion) {
    existing.level = Math.min(6, (existing.level ?? 1) + (opts.level ?? 1));
  } else if (!existing) {
    list.push({ name, level: isExhaustion ? (opts.level ?? 1) : undefined, source: opts.source });
    if (INCAPACITATING.includes(name.toLowerCase()) && !target) {
      const b = breakConcentration(c);
      if (b) broke = b;
    }
  }
  const summary = entry ? (entry.data["summary"] as string | undefined) : undefined;
  return { target: holder, conditions: list, rules: summary, broke };
}

export function removeCondition(c: Character, condition: string, opts: ConditionOptions = {}): { target: string; conditions: ActiveCondition[] } {
  const target = opts.companion ? findCompanion(c, opts.companion) : null;
  if (opts.companion && !target) throw new DomainError("not_found", `Compañero "${opts.companion}" no encontrado.`);
  const list = target ? target.conditions : c.conditions;
  const holder = target ? target.name : c.name;
  const entry = findEntry(condition, "condition");
  const name = entry?.name ?? condition;
  const existing = list.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!existing) throw new DomainError("not_found", `${holder} no tiene la condición "${name}".`);
  const isExhaustion = name.toLowerCase() === "exhaustion";
  if (isExhaustion && (existing.level ?? 1) > (opts.level ?? 1)) {
    existing.level = (existing.level ?? 1) - (opts.level ?? 1);
  } else {
    list.splice(list.indexOf(existing), 1);
  }
  return { target: holder, conditions: list };
}

// ─── Efectos activos ───

export interface AddEffectInput { name: string; description?: string; rounds?: number; concentration?: boolean; companion?: string; }

export function addEffect(c: Character, input: AddEffectInput): { broke?: string } {
  let companionId: string | undefined;
  if (input.companion) {
    const k = findCompanion(c, input.companion);
    if (!k) throw new DomainError("not_found", `Compañero "${input.companion}" no encontrado.`);
    companionId = k.id;
  }
  let broke: string | undefined;
  if (input.concentration) {
    const b = breakConcentration(c);
    if (b) broke = b;
    c.spellcasting.concentratingOn = input.name;
  }
  c.effects.push({
    id: newId("eff"), name: input.name, description: input.description,
    roundsRemaining: input.rounds ?? null, minutesRemaining: null,
    concentration: input.concentration ?? false,
    appliesTo: companionId ? "companion" : "self", companionId,
  });
  return { broke };
}

export function removeEffect(c: Character, name: string): void {
  const eff = c.effects.find((e) => e.name.toLowerCase().includes(name.toLowerCase()));
  if (!eff) throw new DomainError("not_found", `Efecto "${name}" no activo.`);
  if (eff.concentration && c.spellcasting.concentratingOn === eff.name) c.spellcasting.concentratingOn = null;
  c.effects = c.effects.filter((e) => e.id !== eff.id);
}

export function tickEffects(c: Character, rounds = 1): { expired: string[] } {
  const expired: string[] = [];
  for (const e of c.effects) {
    if (e.roundsRemaining != null) {
      e.roundsRemaining -= rounds;
      if (e.roundsRemaining <= 0) {
        expired.push(e.name);
        if (e.concentration && c.spellcasting.concentratingOn === e.name) c.spellcasting.concentratingOn = null;
      }
    }
  }
  c.effects = c.effects.filter((e) => e.roundsRemaining == null || e.roundsRemaining > 0);
  return { expired };
}

// ─── Descansos ───

export interface RestResult {
  type: "short" | "long";
  notes: string[];
  hp: Character["hp"];
  hitDice: { die: string; available: number; total: number }[];
  slots: Character["spellcasting"]["slots"];
  pactSlots: Character["spellcasting"]["pactSlots"] | null;
  conditions: ActiveCondition[];
}

export function rest(c: Character, type: "short" | "long", hitDiceToSpend = 0): RestResult {
  const notes: string[] = [];
  if (type === "short") {
    if (hitDiceToSpend > 0) {
      const conMod = abilityMod(c.abilities.con);
      let healed = 0, spent = 0;
      for (const hd of c.hitDice) {
        while (spent < hitDiceToSpend && hd.used < hd.total) {
          const roll = 1 + Math.floor(Math.random() * hd.die);
          healed += Math.max(0, roll + conMod);
          hd.used += 1;
          spent += 1;
        }
      }
      if (spent === 0) {
        throw new DomainError("rule", `${c.name} no tiene dados de golpe disponibles.`);
      }
      c.hp.current = Math.min(c.hp.max, c.hp.current + healed);
      notes.push(`Curado ${healed} PG con ${spent} dado(s) de golpe.`);
    }
    if (c.spellcasting.pactSlots) { c.spellcasting.pactSlots.used = 0; notes.push("Slots de pacto recuperados."); }
    for (const f of c.features) if (f.uses?.recharge === "short_rest") f.uses.used = 0;
    if (c.wildShape && c.wildShape.used > 0) { c.wildShape.used = Math.max(0, c.wildShape.used - 1); notes.push("Recuperas un uso de Forma Salvaje."); } // 2024: 1 uso en descanso corto
    notes.push(...rechargeItemsOnRest(c, "short"));
  } else {
    c.hp.current = c.hp.max;
    c.hp.temp = 0;
    for (const hd of c.hitDice) hd.used = Math.max(0, hd.used - Math.max(1, Math.floor(hd.total / 2)));
    for (const slot of Object.values(c.spellcasting.slots)) slot.used = 0;
    if (c.spellcasting.pactSlots) c.spellcasting.pactSlots.used = 0;
    for (const f of c.features) if (f.uses && (f.uses.recharge === "short_rest" || f.uses.recharge === "long_rest")) f.uses.used = 0;
    if (c.wildShape) c.wildShape.used = 0; // 2024: todos los usos de Forma Salvaje en descanso largo
    const exh = c.conditions.find((x) => x.name.toLowerCase() === "exhaustion");
    if (exh) {
      exh.level = (exh.level ?? 1) - 1;
      if (exh.level <= 0) c.conditions = c.conditions.filter((x) => x !== exh);
      notes.push(`Exhaustion ${exh.level && exh.level > 0 ? `baja a nivel ${exh.level}` : "eliminada"}.`);
    }
    c.effects = [];
    c.spellcasting.concentratingOn = null;
    c.deathSaves = { successes: 0, failures: 0 };
    notes.push("PG al máximo, slots restaurados, efectos limpiados.");
    notes.push(...rechargeItemsOnRest(c, "long"));
  }
  return {
    type,
    notes,
    hp: c.hp,
    hitDice: c.hitDice.map((h) => ({ die: `d${h.die}`, available: h.total - h.used, total: h.total })),
    slots: c.spellcasting.slots,
    pactSlots: c.spellcasting.pactSlots ?? null,
    conditions: c.conditions,
  };
}
