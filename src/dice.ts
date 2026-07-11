import { randomInt } from "node:crypto";

export interface RollDetail {
  expression: string;
  rolls: { dice: string; results: number[]; kept: number[]; subtotal: number }[];
  modifier: number;
  total: number;
  crit?: "critical" | "fumble";
  breakdown: string;
}

function rollDie(sides: number): number {
  return randomInt(1, sides + 1);
}

/**
 * Parser de expresiones de dados: "2d6+3", "1d20", "4d6kh3", "2d20kl1-1", "d100".
 * kh/kl = keep highest/lowest N; dh/dl = drop highest/lowest N.
 */
export function rollExpression(expr: string): RollDetail {
  const clean = expr.replace(/\s+/g, "").toLowerCase();
  if (!clean) throw new Error("Expresión de dados vacía. Ejemplos: '1d20+5', '2d6+3', '4d6kh3'.");

  const tokenRe = /([+-]?)(\d*)d(\d+)(?:(kh|kl|dh|dl)(\d+))?|([+-]\d+)/g;
  let match: RegExpExecArray | null;
  let consumed = 0;
  const rolls: RollDetail["rolls"] = [];
  let modifier = 0;
  let firstD20: number[] | null = null;

  while ((match = tokenRe.exec(clean)) !== null) {
    if (match.index !== consumed) break;
    consumed = tokenRe.lastIndex;

    if (match[6] !== undefined) {
      modifier += parseInt(match[6], 10);
      continue;
    }
    const sign = match[1] === "-" ? -1 : 1;
    const count = match[2] ? parseInt(match[2], 10) : 1;
    const sides = parseInt(match[3], 10);
    if (count < 1 || count > 100) throw new Error(`Número de dados fuera de rango (1-100): ${count}`);
    if (sides < 2 || sides > 1000) throw new Error(`Caras del dado fuera de rango (2-1000): ${sides}`);

    const results = Array.from({ length: count }, () => rollDie(sides));
    let kept = [...results];
    const op = match[4];
    const n = match[5] ? parseInt(match[5], 10) : 0;
    if (op && n > 0) {
      const sorted = [...results].sort((a, b) => b - a); // desc
      if (op === "kh") kept = sorted.slice(0, n);
      else if (op === "kl") kept = sorted.slice(-n);
      else if (op === "dh") kept = sorted.slice(n);
      else if (op === "dl") kept = sorted.slice(0, sorted.length - n);
    }
    const subtotal = sign * kept.reduce((s, r) => s + r, 0);
    rolls.push({ dice: `${match[1]}${count}d${sides}${op ? op + n : ""}`, results, kept, subtotal });
    if (sides === 20 && !firstD20) firstD20 = kept;
  }

  if (consumed !== clean.length || rolls.length === 0 && modifier === 0) {
    throw new Error(
      `No pude interpretar "${expr}". Formato: NdM[kh/kl/dh/dlX][+/-mod]. Ejemplos: '1d20+7', '8d6', '4d6kh3', '2d20kl1'.`
    );
  }

  const total = rolls.reduce((s, r) => s + r.subtotal, 0) + modifier;
  const detail: RollDetail = {
    expression: expr,
    rolls,
    modifier,
    total,
    breakdown:
      rolls.map((r) => `${r.dice}: [${r.results.join(", ")}]${r.kept.length !== r.results.length ? ` → conserva [${r.kept.join(", ")}]` : ""}`).join(" | ") +
      (modifier ? ` ${modifier > 0 ? "+" : ""}${modifier}` : "") +
      ` = ${total}`,
  };
  if (firstD20 && firstD20.length === 1) {
    if (firstD20[0] === 20) detail.crit = "critical";
    else if (firstD20[0] === 1) detail.crit = "fumble";
  }
  return detail;
}

/** d20 con ventaja/desventaja + modificador. */
export function d20Roll(
  modifier: number,
  mode: "normal" | "advantage" | "disadvantage" = "normal",
  critThreshold = 20
): RollDetail {
  let r: RollDetail;
  if (mode === "normal") {
    r = rollExpression(`1d20${modifier >= 0 ? "+" : ""}${modifier}`);
  } else {
    const op = mode === "advantage" ? "kh1" : "kl1";
    r = rollExpression(`2d20${op}${modifier >= 0 ? "+" : ""}${modifier}`);
    r.breakdown = `(${mode === "advantage" ? "ventaja" : "desventaja"}) ${r.breakdown}`;
  }
  const kept = r.rolls[0]?.kept[0];
  if (kept === 1) r.crit = "fumble";
  else if (kept !== undefined && kept >= critThreshold) r.crit = "critical";
  else r.crit = undefined;
  return r;
}

/** Convierte una tirada a la notación de dados 3D: cada dado conservado con su cara (para dice-box). */
export function dice3dFrom(r: RollDetail): { sides: number; value: number }[] {
  const out: { sides: number; value: number }[] = [];
  for (const g of r.rolls) {
    const sides = Number(g.dice.match(/d(\d+)/)?.[1] ?? 20);
    for (const v of g.kept) out.push({ sides, value: v });
  }
  return out;
}
