// Dominio de dados y pruebas del personaje. Usa los modificadores calculados por rules.ts.

import { d20Roll, rollExpression, type RollDetail } from "../dice.js";
import { DomainError } from "./errors.js";
import {
  ABILITIES, SKILLS, abilityMod, fmt, proficiencyBonus,
  saveBonus, skillBonus, spellStats, totalLevel,
} from "../rules.js";
import type { AbilityKey, Character } from "../types.js";

export type RollMode = "normal" | "advantage" | "disadvantage";

/** Tira una expresión de dados, opcionalmente con ventaja/desventaja (d20 simple) y repetición. */
export function rollDice(expression: string, advantage: RollMode = "normal", times = 1): RollDetail[] {
  if (times < 1 || times > 100) throw new DomainError("validation", "times fuera de rango (1-100).");
  const results: RollDetail[] = [];
  for (let i = 0; i < times; i++) {
    if (advantage !== "normal") {
      const m = expression.replace(/\s+/g, "").match(/^1?d20([+-]\d+)?$/i);
      if (m) { results.push(d20Roll(m[1] ? parseInt(m[1], 10) : 0, advantage)); continue; }
    }
    results.push(rollExpression(expression));
  }
  return results;
}

export type CheckType = "skill" | "ability" | "save" | "initiative" | "attack" | "spell_attack" | "damage";

export type CheckResult =
  | { type: "damage"; weapon: string; expression: string; total: number; breakdown: string; damageType: string; critical: boolean }
  | { type: Exclude<CheckType, "damage">; target: string | null; roll: number; breakdown: string; modifierDetail: string; crit: "critical" | "fumble" | null };

export interface CheckInput {
  type: CheckType;
  target?: string;
  advantage?: RollMode;
  bonus?: number;
  critical?: boolean;
}

export function check(c: Character, input: CheckInput): CheckResult {
  const { type } = input;
  const advantage = input.advantage ?? "normal";
  const bonus = input.bonus ?? 0;
  const critical = input.critical ?? false;
  const pb = proficiencyBonus(totalLevel(c));

  let mod: number;
  let detail: string;

  switch (type) {
    case "skill": {
      if (!input.target) throw new DomainError("validation", `type=skill requiere target. Habilidades: ${Object.keys(SKILLS).join(", ")}.`);
      ({ bonus: mod, detail } = skillBonus(c, input.target));
      break;
    }
    case "ability": {
      if (!input.target || !ABILITIES.includes(input.target.toLowerCase() as AbilityKey)) {
        throw new DomainError("validation", `type=ability requiere target entre: ${ABILITIES.join(", ")}.`);
      }
      const key = input.target.toLowerCase() as AbilityKey;
      mod = abilityMod(c.abilities[key]);
      detail = `${key.toUpperCase()}(${fmt(mod)})`;
      break;
    }
    case "save": {
      if (!input.target || !ABILITIES.includes(input.target.toLowerCase() as AbilityKey)) {
        throw new DomainError("validation", `type=save requiere target entre: ${ABILITIES.join(", ")}.`);
      }
      ({ bonus: mod, detail } = saveBonus(c, input.target.toLowerCase() as AbilityKey));
      break;
    }
    case "initiative": {
      mod = abilityMod(c.abilities.dex) + c.initiativeBonus;
      detail = `DES(${fmt(abilityMod(c.abilities.dex))})${c.initiativeBonus ? ` + extra(${fmt(c.initiativeBonus)})` : ""}`;
      break;
    }
    case "spell_attack": {
      const s = spellStats(c);
      if (!s) throw new DomainError("rule", `${c.name} no tiene habilidad de conjuro definida.`);
      mod = s.attack;
      detail = `conjuro ${s.ability.toUpperCase()} (${fmt(s.attack)})`;
      break;
    }
    case "attack":
    case "damage": {
      if (!input.target) throw new DomainError("validation", `type=${type} requiere target (nombre del arma).`);
      const weapon = c.inventory.find((i) => i.name.toLowerCase().includes(input.target!.toLowerCase()) && i.type === "weapon");
      if (!weapon) {
        const weapons = c.inventory.filter((i) => i.type === "weapon").map((i) => i.name).join(", ") || "ninguna";
        throw new DomainError("not_found", `Arma "${input.target}" no está en el inventario de ${c.name}. Armas: ${weapons}.`);
      }
      const finesse = weapon.properties?.some((p) => p.toLowerCase().includes("finesse")) ?? false;
      const strMod = abilityMod(c.abilities.str);
      const dexMod = abilityMod(c.abilities.dex);
      const ranged = weapon.properties?.some((p) => p.toLowerCase().includes("ammunition")) ?? false;
      const abMod = ranged ? dexMod : finesse ? Math.max(strMod, dexMod) : strMod;
      const magic = weapon.magicBonus ?? 0;

      if (type === "attack") {
        mod = abMod + pb + magic;
        detail = `${ranged ? "DES" : finesse && dexMod > strMod ? "DES(finesse)" : "FUE"}(${fmt(abMod)}) + comp(${fmt(pb)})${magic ? ` + mágico(${fmt(magic)})` : ""}`;
        break;
      }
      // damage
      const dmgMatch = (weapon.damage ?? "1d4").match(/(\d+)d(\d+)/);
      if (!dmgMatch) throw new DomainError("rule", `El arma ${weapon.name} no tiene fórmula de daño válida (${weapon.damage}).`);
      const count = parseInt(dmgMatch[1], 10) * (critical ? 2 : 1);
      const dmgMod = abMod + magic + bonus;
      const expr = `${count}d${dmgMatch[2]}${dmgMod ? (dmgMod > 0 ? `+${dmgMod}` : `${dmgMod}`) : ""}`;
      const r = rollExpression(expr);
      return {
        type: "damage", weapon: weapon.name, expression: expr, total: r.total, breakdown: r.breakdown,
        damageType: weapon.damage?.split(" ").slice(1).join(" ") || "?", critical,
      };
    }
  }

  const total = mod + bonus;
  const r = d20Roll(total, advantage);
  return {
    type,
    target: input.target ?? null,
    roll: r.total,
    breakdown: r.breakdown,
    modifierDetail: detail + (bonus ? ` + situacional(${fmt(bonus)})` : ""),
    crit: r.crit ?? null,
  };
}
