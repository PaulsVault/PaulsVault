// Dominio de Forma Salvaje (Druida, reglas 2024): usos por nivel, límites (CR/vuelo) y bestias elegibles.
// Funciones sin I/O sobre `character`.
import { allEntries } from "./content.js";
import { DomainError } from "./errors.js";
import type { Character } from "../types.js";

const crToNum = (cr: string): number =>
  cr === "1/8" ? 0.125 : cr === "1/4" ? 0.25 : cr === "1/2" ? 0.5 : Number(cr) || 0;

/** Nivel de Druida del personaje (0 si no tiene la clase). */
export function druidLevel(c: Character): number {
  return c.classes.find((cl) => cl.name.toLowerCase() === "druid")?.level ?? 0;
}

export interface WildShapeLimits {
  druidLevel: number;
  maxUses: number;      // usos de Forma Salvaje (2 / 3 / 4)
  maxCRNum: number;     // CR máximo numérico
  maxCRLabel: string;   // CR máximo mostrado ("1/4", "1/2", "1")
  knownForms: number;   // nº de formas conocidas (4 / 6 / 8)
  fly: boolean;         // puede adoptar formas con velocidad de vuelo (nivel 8+)
  hours: number;        // duración máxima (mitad del nivel de Druida)
}

/** Límites de Forma Salvaje según el nivel de Druida (2024). null si aún no la tiene (nivel < 2). */
export function wildShapeLimits(level: number): WildShapeLimits | null {
  if (level < 2) return null;
  return {
    druidLevel: level,
    maxUses: level >= 17 ? 4 : level >= 6 ? 3 : 2,
    maxCRNum: level >= 8 ? 1 : level >= 4 ? 0.5 : 0.25,
    maxCRLabel: level >= 8 ? "1" : level >= 4 ? "1/2" : "1/4",
    knownForms: level >= 8 ? 8 : level >= 4 ? 6 : 4,
    fly: level >= 8,
    hours: Math.floor(level / 2),
  };
}

export interface WildShapeState extends WildShapeLimits { used: number }

/** Estado de Forma Salvaje del personaje (límites + usos gastados). null si no aplica. */
export function wildShapeState(c: Character): WildShapeState | null {
  const lim = wildShapeLimits(druidLevel(c));
  if (!lim) return null;
  const used = Math.min(c.wildShape?.used ?? 0, lim.maxUses);
  return { ...lim, used };
}

/** Gasta (+1) o restaura (-1) un uso de Forma Salvaje; respeta 0..máximo. */
export function adjustWildShape(c: Character, delta: number): Character {
  const st = wildShapeState(c);
  if (!st) throw new DomainError("rule", `${c.name} no tiene Forma Salvaje (Druida nivel 2+).`);
  const used = Math.max(0, Math.min(st.maxUses, st.used + delta));
  c.wildShape = { used };
  c.updatedAt = new Date().toISOString();
  return c;
}

export interface BeastForm { name: string; cr: string; crNum: number; size: string; ac: number; hp: number; speed: string; fly: boolean; swim: boolean }

/** Bestias que el Druida puede adoptar a su nivel (tipo bestia, CR ≤ máximo, sin vuelo hasta nivel 8). */
export function eligibleBeasts(c: Character): BeastForm[] {
  const lim = wildShapeLimits(druidLevel(c));
  if (!lim) return [];
  const seen = new Set<string>();
  const out: BeastForm[] = [];
  for (const e of allEntries()) {
    if (e.type !== "monster") continue;
    const d = e.data as Record<string, unknown>;
    if (!String(d["creatureType"] ?? "").toLowerCase().includes("beast")) continue;
    const crNum = crToNum(String(d["cr"] ?? "0"));
    if (crNum > lim.maxCRNum) continue;
    const speed = String(d["speed"] ?? "");
    const fly = /\bfly\b/i.test(speed);
    if (fly && !lim.fly) continue; // sin formas voladoras hasta nivel 8
    const key = e.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const hpVal = d["hp"] as { average?: number } | number | undefined;
    out.push({
      name: e.name, cr: String(d["cr"] ?? "0"), crNum,
      size: String(d["size"] ?? "—"),
      ac: Number(d["ac"] ?? 0),
      hp: typeof hpVal === "object" ? (hpVal?.average ?? 0) : Number(hpVal ?? 0),
      speed, fly, swim: /\bswim\b/i.test(speed),
    });
  }
  return out.sort((a, b) => a.crNum - b.crNum || a.name.localeCompare(b.name));
}
