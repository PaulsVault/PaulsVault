import { beforeEach, describe, expect, it } from "vitest";
import { loadDb, saveDb } from "../../src/store.js";
import { createCharacter } from "../../src/domain/characters.js";
import {
  addItem, adjustCurrency, attuneItem, equipItem, removeItem, updateItem,
} from "../../src/domain/inventory.js";
import { computeAC } from "../../src/rules.js";
import { DomainError } from "../../src/domain/errors.js";
import type { Abilities, Character } from "../../src/types.js";

const ABIL: Abilities = { str: 14, dex: 14, con: 12, int: 10, wis: 10, cha: 10 };

function newFighter(name: string): Character {
  const db = loadDb();
  db.characters = [];
  saveDb(db);
  return createCharacter(db, { name, className: "Fighter", species: "Human", background: "Soldier", abilities: ABIL });
}

beforeEach(() => {
  const db = loadDb();
  db.characters = [];
  saveDb(db);
});

describe("addItem", () => {
  it("autocompleta datos del contenido SRD (Longsword → arma, daño)", () => {
    const c = newFighter("Guerrero");
    const it = addItem(c, "Longsword");
    expect(it.type).toBe("weapon");
    expect(it.damage).toContain("1d8");
  });

  it("apila cantidad al añadir el mismo objeto sin detalles", () => {
    const c = newFighter("Guerrero");
    addItem(c, "Dagger", 2);
    addItem(c, "Dagger", 3);
    expect(c.inventory.filter((i) => i.name === "Dagger")).toHaveLength(1);
    expect(c.inventory.find((i) => i.name === "Dagger")?.quantity).toBe(5);
  });
});

describe("equip / CA", () => {
  it("equipar armadura pesada fija la CA a su valor base (Chain Mail 16)", () => {
    const c = newFighter("Tanque");
    addItem(c, "Chain Mail");
    equipItem(c, "Chain Mail");
    expect(computeAC(c).ac).toBe(16);
  });

  it("equipar otra armadura desequipa la anterior", () => {
    const c = newFighter("Tanque");
    addItem(c, "Chain Mail");
    addItem(c, "Leather Armor");
    equipItem(c, "Chain Mail");
    equipItem(c, "Leather Armor"); // ligera: 11 + DEX(+2) = 13
    expect(c.inventory.find((i) => i.name === "Chain Mail")?.equipped).toBe(false);
    expect(computeAC(c).ac).toBe(13);
  });

  it("escudo suma su bono a la CA", () => {
    const c = newFighter("Tanque");
    addItem(c, "Chain Mail");
    addItem(c, "Shield");
    equipItem(c, "Chain Mail");
    equipItem(c, "Shield");
    expect(computeAC(c).ac).toBe(18); // 16 + 2
  });
});

describe("attunement (máx 3)", () => {
  it("permite 3 objetos sintonizados y rechaza el 4º", () => {
    const c = newFighter("Sintonizador");
    for (const n of ["Anillo A", "Anillo B", "Anillo C", "Anillo D"]) {
      addItem(c, n, 1, { type: "wondrous", requiresAttunement: true });
    }
    attuneItem(c, "Anillo A");
    attuneItem(c, "Anillo B");
    attuneItem(c, "Anillo C");
    expect(() => attuneItem(c, "Anillo D")).toThrowError(DomainError);
  });
});

describe("update / remove", () => {
  it("mueve un objeto a un contenedor por nombre", () => {
    const c = newFighter("Cargador");
    const pack = addItem(c, "Mochila", 1, { type: "container" });
    addItem(c, "Torch", 5, { type: "gear" });
    updateItem(c, "Torch", undefined, { container: "Mochila" });
    expect(c.inventory.find((i) => i.name === "Torch")?.containerId).toBe(pack.id);
  });

  it("removeItem baja cantidad y elimina al llegar a 0", () => {
    const c = newFighter("Cargador");
    addItem(c, "Dagger", 2);
    removeItem(c, "Dagger", 1);
    expect(c.inventory.find((i) => i.name === "Dagger")?.quantity).toBe(1);
    removeItem(c, "Dagger", 5);
    expect(c.inventory.find((i) => i.name === "Dagger")).toBeUndefined();
  });
});

describe("currency", () => {
  it("suma y resta; total en oro correcto", () => {
    const c = newFighter("Rico");
    adjustCurrency(c, { gp: 10, sp: 5 });
    const res = adjustCurrency(c, { gp: -4 });
    expect(res.currency.gp).toBe(6);
    expect(res.totalInGold).toBe(6.5); // 6 gp + 5 sp (0.1)
  });

  it("rechaza dejar una denominación en negativo", () => {
    const c = newFighter("Pobre");
    expect(() => adjustCurrency(c, { gp: -1 })).toThrowError(DomainError);
  });
});
