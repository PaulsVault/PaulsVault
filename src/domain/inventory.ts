// Dominio de inventario y dinero. Funciones sin I/O sobre `character`.
// Equipar armadura/escudo recalcula CA (vía computeAC en la vista). Sintonización máx 3.

import { findEntry } from "./content.js";
import { DomainError } from "./errors.js";
import { spellMechanics } from "./spells.js";
import { carriedWeight, carryCapacity, computeAC, newId, spellStats } from "../rules.js";
import type { Character, Currency, InventoryItem, ItemType } from "../types.js";

export interface ItemDetails {
  type?: ItemType;
  weight?: number;
  description?: string;
  armorClass?: number;
  armorCategory?: "light" | "medium" | "heavy" | "shield";
  damage?: string;
  properties?: string[];
  magicBonus?: number;
  requiresAttunement?: boolean;
  container?: string | null;
}

/** Localiza un objeto por id, nombre exacto o coincidencia parcial. Lanza si no existe. */
export function requireItem(c: Character, idOrName: string): InventoryItem {
  const q = idOrName.trim().toLowerCase();
  const found =
    c.inventory.find((i) => i.id === idOrName) ??
    c.inventory.find((i) => i.name.toLowerCase() === q) ??
    c.inventory.find((i) => i.name.toLowerCase().includes(q));
  if (!found) {
    const items = c.inventory.map((i) => i.name).join(", ") || "ninguno";
    throw new DomainError("not_found", `Objeto "${idOrName}" no está en el inventario de ${c.name}. Objetos: ${items}.`);
  }
  return found;
}

export function inventoryView(c: Character): Record<string, unknown> {
  return {
    inventory: c.inventory.map((i) => {
      // Descripción: la del objeto o, si no la tiene, la del contenido instalado.
      const description = i.description ?? (findEntry(i.name, "item")?.data["description"] as string | undefined) ?? undefined;
      // Objeto activable (efecto sin cargas, tipo Horn of Blasting): daño + salvación/ataque/área en el texto.
      const mech = description ? spellMechanics({ summary: description }) : {};
      const activatable = !i.spells && !!mech.damage && !!(mech.save || mech.attack || mech.shape);
      return {
        id: i.id, name: i.name, type: i.type, qty: i.quantity,
        equipped: i.equipped, attuned: i.attuned,
        requiresAttunement: i.requiresAttunement,
        ...(i.damage ? { damage: i.damage } : {}),
        ...(i.containerId ? { inside: c.inventory.find((x) => x.id === i.containerId)?.name } : {}),
        ...(i.charges ? { charges: i.charges } : {}),
        ...(i.spells ? { spells: i.spells } : {}),
        ...(activatable ? { activatable: true } : {}),
        description,
      };
    }),
    encumbrance: { carried: carriedWeight(c), capacity: carryCapacity(c) },
    ac: computeAC(c).ac,
    currency: c.currency,
  };
}

/** Añade un objeto. Autocompleta datos si el nombre coincide con el contenido instalado. */
export function addItem(c: Character, item: string, quantity = 1, details?: ItemDetails): InventoryItem {
  const content = findEntry(item, "item");
  const cd = (content?.data ?? {}) as Record<string, unknown>;
  const existing = c.inventory.find((i) => i.name.toLowerCase() === item.toLowerCase() && !i.equipped);
  if (existing && !details) {
    existing.quantity += quantity;
    return existing;
  }
  const it: InventoryItem = {
    id: newId("itm"),
    name: content?.name ?? item,
    type: details?.type ?? (cd["itemType"] as ItemType) ?? "gear",
    quantity,
    weight: details?.weight ?? (cd["weight"] as number | undefined),
    equipped: false,
    requiresAttunement: details?.requiresAttunement ?? (cd["requiresAttunement"] as boolean | undefined) ?? false,
    attuned: false,
    description: details?.description ?? (cd["description"] as string | undefined) ?? (typeof cd["cost"] === "string" ? `Coste: ${cd["cost"]}` : undefined),
    armorClass: details?.armorClass ?? (cd["armorClass"] as number | undefined),
    armorCategory: details?.armorCategory ?? (cd["armorCategory"] as InventoryItem["armorCategory"]),
    damage: details?.damage ?? (cd["damage"] as string | undefined),
    properties: details?.properties ?? (cd["properties"] as string[] | undefined),
    magicBonus: details?.magicBonus ?? (cd["magicBonus"] as number | undefined),
    containerId: null,
  };
  // Cargas y conjuros del objeto (Staff of Power, varitas, etc.).
  const chargesMax = cd["charges"] as number | undefined;
  if (typeof chargesMax === "number") {
    it.charges = { current: chargesMax, max: chargesMax, recharge: cd["recharge"] as string | undefined, rechargeAmount: cd["rechargeAmount"] as string | undefined };
  }
  const itemSpells = cd["spells"] as { cost: number; name: string }[] | undefined;
  if (Array.isArray(itemSpells) && itemSpells.length) it.spells = itemSpells;
  c.inventory.push(it);
  return it;
}

// ─── Interacción con objetos mágicos (cargas y conjuros) ───

export function useItemCharges(c: Character, idOrName: string, amount = 1): InventoryItem {
  const it = requireItem(c, idOrName);
  if (!it.charges) throw new DomainError("rule", `${it.name} no tiene cargas.`);
  if (it.requiresAttunement && !it.attuned) throw new DomainError("rule", `Debes sintonizar ${it.name} para usar sus cargas.`);
  if (amount <= 0) throw new DomainError("validation", "Cantidad de cargas inválida.");
  if (it.charges.current < amount) throw new DomainError("rule", `${it.name} solo tiene ${it.charges.current} carga(s).`);
  it.charges.current -= amount;
  return it;
}

export function restoreItemCharges(c: Character, idOrName: string, amount?: number): InventoryItem {
  const it = requireItem(c, idOrName);
  if (!it.charges) throw new DomainError("rule", `${it.name} no tiene cargas.`);
  it.charges.current = amount != null ? Math.min(it.charges.max, Math.max(0, amount)) : it.charges.max;
  return it;
}

export interface ItemCastResult {
  item: string; spell: string; cost: number; chargesLeft: number;
  saveDC: number | null; attackBonus: number | null; summary?: string;
  mechanics: ReturnType<typeof spellMechanics>;
}

/** Lanza un conjuro desde un objeto: valida sintonía y cargas, las gasta y devuelve el efecto. */
export function castItemSpell(c: Character, idOrName: string, spellName: string): ItemCastResult {
  const it = requireItem(c, idOrName);
  if (!it.charges || !it.spells?.length) throw new DomainError("rule", `${it.name} no lanza conjuros con cargas.`);
  if (it.requiresAttunement && !it.attuned) throw new DomainError("rule", `Debes sintonizar ${it.name}.`);
  const entry = it.spells.find((s) => s.name.toLowerCase() === spellName.toLowerCase());
  if (!entry) throw new DomainError("not_found", `${it.name} no puede lanzar "${spellName}".`);
  if (it.charges.current < entry.cost) throw new DomainError("rule", `Necesitas ${entry.cost} carga(s) y ${it.name} tiene ${it.charges.current}.`);
  it.charges.current -= entry.cost;
  const cd = (findEntry(entry.name, "spell")?.data ?? {}) as Record<string, unknown>;
  const stats = spellStats(c);
  return {
    item: it.name, spell: entry.name, cost: entry.cost, chargesLeft: it.charges.current,
    saveDC: stats?.dc ?? null, attackBonus: stats?.attack ?? null,
    summary: (cd["summary"] as string | undefined),
    mechanics: spellMechanics(cd),
  };
}

export interface ItemUseResult {
  item: string; saveDC: number | null; summary?: string;
  mechanics: ReturnType<typeof spellMechanics>;
  destroyed?: boolean; selfDamage?: string; note?: string;
}

/** Usa el efecto mágico de un objeto SIN cargas (Horn of Blasting, etc.): devuelve el efecto y aplica la posible auto-destrucción. */
export function useItem(c: Character, idOrName: string): ItemUseResult {
  const it = requireItem(c, idOrName);
  if (it.requiresAttunement && !it.attuned) throw new DomainError("rule", `Debes sintonizar ${it.name} para usarlo.`);
  const desc = it.description ?? (findEntry(it.name, "item")?.data["description"] as string | undefined) ?? "";
  const mech = spellMechanics({ summary: desc });
  const dcM = desc.match(/DC (\d+)/);
  const saveDC = dcM ? Number(dcM[1]) : (spellStats(c)?.dc ?? null);

  let destroyed = false, selfDamage: string | undefined, note: string | undefined;
  const chance = desc.match(/(\d+)\s*percent chance[^.]*?(?:explode|destroy)/i);
  if (chance) {
    const pct = Number(chance[1]);
    const roll = 1 + Math.floor(Math.random() * 100);
    if (roll <= pct) {
      destroyed = true;
      selfDamage = (desc.match(/explosion deals (\d+d\d+)/i) ?? desc.match(/(\d+d\d+)\s+Force damage to the user/i))?.[1];
      c.inventory = c.inventory.filter((x) => x.id !== it.id);
      note = `¡${it.name} explotó! (${roll} ≤ ${pct}%). Se destruye${selfDamage ? ` y te causa ${selfDamage} de daño de Fuerza` : ""}.`;
    } else {
      note = `${it.name} resiste (${roll} > ${pct}%).`;
    }
  }
  return { item: it.name, saveDC, summary: desc.slice(0, 400), mechanics: mech, destroyed, selfDamage, note };
}

/** Recarga los objetos con cargas cuyo periodo coincide con el descanso. Devuelve notas. */
export function rechargeItemsOnRest(c: Character, type: "short" | "long"): string[] {
  const LONG = ["dawn", "dusk", "midnight", "daily", "long rest", "restlong", "long"];
  const SHORT = ["short rest", "restshort", "short"];
  const notes: string[] = [];
  for (const it of c.inventory) {
    if (!it.charges || it.charges.current >= it.charges.max) continue;
    const rc = (it.charges.recharge ?? "dawn").toLowerCase();
    if (!(type === "long" ? LONG.includes(rc) : SHORT.includes(rc))) continue;
    const amt = rollRecharge(it.charges.rechargeAmount);
    it.charges.current = amt === null ? it.charges.max : Math.min(it.charges.max, it.charges.current + amt);
    notes.push(`${it.name}: ${it.charges.current}/${it.charges.max} cargas.`);
  }
  return notes;
}

function rollRecharge(expr?: string): number | null {
  if (!expr) return null; // sin fórmula → recarga completa
  const m = expr.replace(/\s+/g, "").match(/(\d+)d(\d+)([+-]\d+)?/);
  if (!m) { const flat = Number(expr); return Number.isFinite(flat) ? flat : null; }
  let total = Number(m[3] ?? 0);
  for (let i = 0; i < Number(m[1]); i++) total += 1 + Math.floor(Math.random() * Number(m[2]));
  return total;
}

export function removeItem(c: Character, idOrName: string, quantity = 1): void {
  const it = requireItem(c, idOrName);
  it.quantity -= quantity;
  if (it.quantity <= 0) c.inventory = c.inventory.filter((x) => x.id !== it.id);
}

export function equipItem(c: Character, idOrName: string): InventoryItem {
  const it = requireItem(c, idOrName);
  if (it.type === "armor") {
    for (const other of c.inventory) if (other.type === "armor") other.equipped = false;
  }
  if (it.type === "shield" || it.armorCategory === "shield") {
    for (const other of c.inventory) if (other.type === "shield" || other.armorCategory === "shield") other.equipped = false;
  }
  it.equipped = true;
  it.containerId = null;
  return it;
}

export function unequipItem(c: Character, idOrName: string): InventoryItem {
  const it = requireItem(c, idOrName);
  it.equipped = false;
  return it;
}

export function attuneItem(c: Character, idOrName: string): InventoryItem {
  const it = requireItem(c, idOrName);
  const attunedCount = c.inventory.filter((x) => x.attuned).length;
  if (!it.attuned && attunedCount >= 3) {
    const attuned = c.inventory.filter((x) => x.attuned).map((x) => x.name).join(", ");
    throw new DomainError("rule", `${c.name} ya tiene 3 objetos sintonizados (máximo). Desintoniza uno primero: ${attuned}.`);
  }
  it.attuned = true;
  return it;
}

export function unattuneItem(c: Character, idOrName: string): InventoryItem {
  const it = requireItem(c, idOrName);
  it.attuned = false;
  return it;
}

export function updateItem(c: Character, idOrName: string, quantity?: number, details?: ItemDetails): InventoryItem {
  const it = requireItem(c, idOrName);
  if (quantity !== undefined) it.quantity = quantity;
  if (details) {
    if (details.type) it.type = details.type;
    if (details.weight !== undefined) it.weight = details.weight;
    if (details.description !== undefined) it.description = details.description;
    if (details.armorClass !== undefined) it.armorClass = details.armorClass;
    if (details.armorCategory) it.armorCategory = details.armorCategory;
    if (details.damage !== undefined) it.damage = details.damage;
    if (details.properties) it.properties = details.properties;
    if (details.magicBonus !== undefined) it.magicBonus = details.magicBonus;
    if (details.requiresAttunement !== undefined) it.requiresAttunement = details.requiresAttunement;
    if (details.container !== undefined) {
      it.containerId = details.container ? requireItem(c, details.container).id : null;
    }
  }
  return it;
}

// ─── Dinero ───

const DENOMS: (keyof Currency)[] = ["pp", "gp", "ep", "sp", "cp"];

export function adjustCurrency(c: Character, delta: Partial<Currency>): { currency: Currency; totalInGold: number } {
  for (const k of DENOMS) {
    const v = delta[k] ?? 0;
    if (c.currency[k] + v < 0) {
      throw new DomainError("rule", `Fondos insuficientes: ${c.name} tiene ${c.currency[k]} ${k} y se intenta restar ${-v}. Convierte denominaciones primero (1 pp = 10 gp; 1 gp = 10 sp; 1 sp = 10 cp; 1 ep = 5 sp).`);
    }
  }
  for (const k of DENOMS) c.currency[k] += delta[k] ?? 0;
  const totalInGold =
    c.currency.pp * 10 + c.currency.gp + c.currency.ep * 0.5 + c.currency.sp * 0.1 + c.currency.cp * 0.01;
  return { currency: c.currency, totalInGold: Math.round(totalInGold * 100) / 100 };
}
