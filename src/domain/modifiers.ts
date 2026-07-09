// Motor de modificadores activos (§13 del PRD). Agrega los modificadores de condiciones,
// concentración y efectos/conjuros y los aplica a los valores derivados (CA, velocidad,
// ventaja/desventaja, auto-fallo, incapacitación) siguiendo las reglas de combinación 2024.
//
// Las mecánicas de las condiciones y conjuros SRD tienen defaults aquí, pero cualquier
// condición o efecto puede traer su propio `mechanics: StatModifier[]` (homebrew por packs).

import { findEntry } from "./content.js";
import { ABILITIES, computeAC } from "../rules.js";
import type { AbilityKey, ActiveEffect, Character, StatModifier } from "../types.js";

export type RollMode = "normal" | "advantage" | "disadvantage";

// ─── Mecánicas por defecto (SRD 2024) ───

const AUTOFAIL_STR_DEX: StatModifier[] = [
  { target: "save", op: "autofail", ability: "str" },
  { target: "save", op: "autofail", ability: "dex" },
];

const CONDITION_MECHANICS: Record<string, StatModifier[]> = {
  blinded: [{ target: "attack", op: "disadvantage" }],
  frightened: [{ target: "attack", op: "disadvantage" }, { target: "check", op: "disadvantage" }],
  grappled: [{ target: "speed", op: "set", value: 0 }],
  paralyzed: [{ target: "speed", op: "set", value: 0 }, ...AUTOFAIL_STR_DEX],
  petrified: [{ target: "speed", op: "set", value: 0 }, ...AUTOFAIL_STR_DEX, { target: "damage", op: "resist", note: "todo el daño" }],
  poisoned: [{ target: "attack", op: "disadvantage" }, { target: "check", op: "disadvantage" }],
  prone: [{ target: "attack", op: "disadvantage" }],
  restrained: [{ target: "speed", op: "set", value: 0 }, { target: "attack", op: "disadvantage" }, { target: "save", op: "disadvantage", ability: "dex" }],
  stunned: [...AUTOFAIL_STR_DEX],
  unconscious: [{ target: "speed", op: "set", value: 0 }, ...AUTOFAIL_STR_DEX],
  invisible: [{ target: "attack", op: "advantage" }, { target: "initiative", op: "advantage" }],
};

const INCAPACITATING = new Set(["incapacitated", "paralyzed", "petrified", "stunned", "unconscious"]);

// Conjuros SRD con efecto mecánico cuando están activos (por nombre del efecto).
const SPELL_MECHANICS: Record<string, StatModifier[]> = {
  shield: [{ target: "ac", op: "add", value: 5 }],
  haste: [{ target: "ac", op: "add", value: 2 }, { target: "speed", op: "multiply", value: 2 }, { target: "save", op: "advantage", ability: "dex" }],
  bless: [{ target: "attack", op: "add", value: "1d4" }, { target: "save", op: "add", value: "1d4" }],
  bane: [{ target: "attack", op: "add", value: "-1d4" }, { target: "save", op: "add", value: "-1d4" }],
  guidance: [{ target: "check", op: "add", value: "1d4" }],
  "hunter's mark": [{ target: "damage", op: "add", value: "1d6" }],
};

function conditionMechanics(name: string): StatModifier[] {
  const entry = findEntry(name, "condition");
  const fromContent = entry?.data?.["mechanics"];
  if (Array.isArray(fromContent)) return fromContent as StatModifier[];
  return CONDITION_MECHANICS[name.toLowerCase()] ?? [];
}

function effectMechanics(e: ActiveEffect): StatModifier[] {
  return e.mechanics ?? SPELL_MECHANICS[e.name.toLowerCase()] ?? [];
}

// ─── Cálculo ───

interface SourcedMod extends StatModifier { source: string; }

function netMode(adv: number, dis: number): RollMode {
  if (adv > 0 && dis > 0) return "normal"; // ventaja + desventaja se anulan (2024)
  if (adv > 0) return "advantage";
  if (dis > 0) return "disadvantage";
  return "normal";
}

export interface RollLine { mode: RollMode; bonuses: string[]; }

export interface ComputedModifiers {
  ac: { base: number; final: number; sources: string[] };
  speed: { base: number; final: number; sources: string[] };
  attack: RollLine;
  check: RollLine;
  initiative: RollLine;
  saves: Record<AbilityKey, RollLine & { autofail: boolean }>;
  incapacitated: boolean;
  active: string[];
}

/** Reúne todos los modificadores activos (condiciones + Exhaustion + efectos propios). */
function collect(c: Character): { mods: SourcedMod[]; active: string[]; incapacitated: boolean } {
  const mods: SourcedMod[] = [];
  const active: string[] = [];
  let incapacitated = false;

  for (const cond of c.conditions) {
    const key = cond.name.toLowerCase();
    if (INCAPACITATING.has(key)) incapacitated = true;
    if (key === "exhaustion") {
      const lvl = cond.level ?? 1;
      active.push(`Exhaustion ${lvl}`);
      for (const t of ["attack", "check", "initiative"] as const) mods.push({ target: t, op: "add", value: -2 * lvl, source: `Exhaustion ${lvl}` });
      for (const a of ABILITIES) mods.push({ target: "save", op: "add", value: -2 * lvl, ability: a, source: `Exhaustion ${lvl}` });
      mods.push({ target: "speed", op: "add", value: -5 * lvl, source: `Exhaustion ${lvl}` });
      continue;
    }
    active.push(cond.name);
    for (const m of conditionMechanics(cond.name)) mods.push({ ...m, source: cond.name });
  }

  for (const e of c.effects) {
    if (e.appliesTo !== "self") continue;
    const mechs = effectMechanics(e);
    if (mechs.length) active.push(e.name);
    for (const m of mechs) mods.push({ ...m, source: e.name });
  }
  return { mods, active, incapacitated };
}

function rollLine(mods: SourcedMod[], target: StatModifier["target"], ability?: AbilityKey): RollLine {
  let adv = 0, dis = 0;
  const bonuses: string[] = [];
  for (const m of mods) {
    if (m.target !== target) continue;
    if (m.ability && ability && m.ability !== ability) continue;
    if (m.op === "advantage") adv++;
    else if (m.op === "disadvantage") dis++;
    else if (m.op === "add" && m.value !== undefined) bonuses.push(`${formatBonus(m.value)} (${m.source})`);
  }
  return { mode: netMode(adv, dis), bonuses };
}

function formatBonus(v: number | string): string {
  if (typeof v === "number") return v >= 0 ? `+${v}` : `${v}`;
  return v.startsWith("-") || v.startsWith("+") ? v : `+${v}`;
}

export function computeActiveModifiers(c: Character): ComputedModifiers {
  const { mods, active, incapacitated } = collect(c);

  // CA: base (armadura) → sets (mayor) → sumas → multiplicadores → suelo (min).
  const acBase = computeAC(c).ac;
  const acSets = mods.filter((m) => m.target === "ac" && m.op === "set").map((m) => Number(m.value));
  let ac = acSets.length ? Math.max(acBase, ...acSets) : acBase;
  const acSources: string[] = [];
  for (const m of mods) {
    if (m.target !== "ac") continue;
    if (m.op === "add" && typeof m.value === "number") { ac += m.value; acSources.push(`${formatBonus(m.value)} CA (${m.source})`); }
    else if (m.op === "multiply" && typeof m.value === "number") { ac = Math.floor(ac * m.value); acSources.push(`×${m.value} CA (${m.source})`); }
  }
  for (const m of mods) if (m.target === "ac" && m.op === "min" && typeof m.value === "number") ac = Math.max(ac, m.value);

  // Velocidad: si hay set (condición), fija (0 gana); si no, base + sumas; luego multiplicadores.
  const speedBase = c.speed;
  const speedSets = mods.filter((m) => m.target === "speed" && m.op === "set").map((m) => Number(m.value));
  const speedSources: string[] = [];
  let speed: number;
  if (speedSets.length) {
    speed = Math.min(...speedSets);
    for (const m of mods) if (m.target === "speed" && m.op === "set") speedSources.push(`velocidad ${m.value} (${m.source})`);
  } else {
    speed = speedBase;
    for (const m of mods) if (m.target === "speed" && m.op === "add" && typeof m.value === "number") { speed += m.value; speedSources.push(`${formatBonus(m.value)} ft (${m.source})`); }
  }
  for (const m of mods) if (m.target === "speed" && m.op === "multiply" && typeof m.value === "number") { speed = Math.floor(speed * m.value); speedSources.push(`×${m.value} velocidad (${m.source})`); }
  speed = Math.max(0, speed);

  const saves = Object.fromEntries(
    ABILITIES.map((a) => {
      const line = rollLine(mods, "save", a);
      const autofail = mods.some((m) => m.target === "save" && m.op === "autofail" && m.ability === a);
      return [a, { ...line, autofail }];
    }),
  ) as ComputedModifiers["saves"];

  return {
    ac: { base: acBase, final: ac, sources: acSources },
    speed: { base: speedBase, final: speed, sources: speedSources },
    attack: rollLine(mods, "attack"),
    check: rollLine(mods, "check"),
    initiative: rollLine(mods, "initiative"),
    saves,
    incapacitated,
    active,
  };
}
