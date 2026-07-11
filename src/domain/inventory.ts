// Dominio de inventario y dinero. Funciones sin I/O sobre `character`.
// Equipar armadura/escudo recalcula CA (vía computeAC en la vista). Sintonización máx 3.

import { findEntry } from "./content.js";
import { DomainError } from "./errors.js";
import { carriedWeight, carryCapacity, computeAC, newId } from "../rules.js";
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
    inventory: c.inventory.map((i) => ({
      id: i.id, name: i.name, type: i.type, qty: i.quantity,
      equipped: i.equipped, attuned: i.attuned,
      requiresAttunement: i.requiresAttunement,
      ...(i.damage ? { damage: i.damage } : {}),
      ...(i.containerId ? { inside: c.inventory.find((x) => x.id === i.containerId)?.name } : {}),
      // Descripción: la del objeto o, si no la tiene, la del contenido instalado.
      description: i.description ?? (findEntry(i.name, "item")?.data["description"] as string | undefined) ?? undefined,
    })),
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
  c.inventory.push(it);
  return it;
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
