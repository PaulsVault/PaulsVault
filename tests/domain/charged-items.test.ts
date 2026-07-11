import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCharacter } from "../../src/domain/characters.js";
import { addItem, castItemSpell, useItemCharges } from "../../src/domain/inventory.js";
import { rest } from "../../src/domain/combat.js";
import { importPack, removePack } from "../../src/domain/content.js";
import type { Abilities, Database } from "../../src/types.js";

const ABIL: Abilities = { str: 8, dex: 14, con: 14, int: 18, wis: 12, cha: 10 };
const mage = () => createCharacter({ characters: [] } as Database,
  { name: "M" + Math.random(), className: "Wizard", level: 5, species: "Human", background: "Sage", abilities: ABIL });

beforeAll(async () => {
  await importPack({
    id: "test-staff", name: "objetos test", version: "1.0.0", source: "test",
    entries: [
      { id: "item:test-staff", type: "item", name: "Bastón de Prueba", data: { itemType: "weapon", requiresAttunement: true, charges: 10, recharge: "dawn", rechargeAmount: "10", spells: [{ cost: 3, name: "Bola de Prueba" }] } },
      { id: "spell:test-fireball", type: "spell", name: "Bola de Prueba", data: { level: 3, summary: "Esfera de 20 ft: salvación DES, 8d6 de fuego." } },
    ],
  });
});
afterAll(async () => { await removePack("test-staff"); });

describe("objetos con cargas", () => {
  it("lanzar un conjuro del objeto gasta las cargas y devuelve el efecto", () => {
    const c = mage();
    const staff = addItem(c, "Bastón de Prueba");
    expect(staff.charges?.current).toBe(10);
    staff.attuned = true;
    const r = castItemSpell(c, staff.id, "Bola de Prueba");
    expect(r.cost).toBe(3);
    expect(staff.charges?.current).toBe(7);
    expect(r.mechanics.save).toBe("dex");
    expect(r.mechanics.damage).toBe("8d6");
  });

  it("requiere sintonía y cargas suficientes", () => {
    const c = mage();
    const staff = addItem(c, "Bastón de Prueba");
    expect(() => castItemSpell(c, staff.id, "Bola de Prueba")).toThrow(); // sin sintonizar
    staff.attuned = true;
    staff.charges!.current = 2;
    expect(() => castItemSpell(c, staff.id, "Bola de Prueba")).toThrow(); // 2 < 3
  });

  it("el descanso largo recarga los objetos que recargan al amanecer", () => {
    const c = mage();
    const staff = addItem(c, "Bastón de Prueba"); staff.attuned = true;
    useItemCharges(c, staff.id, 5);
    expect(staff.charges?.current).toBe(5);
    rest(c, "long");
    expect(staff.charges?.current).toBe(10);
  });
});
