import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCharacter } from "../../src/domain/characters.js";
import { addItem, castItemSpell, useItemCharges } from "../../src/domain/inventory.js";
import { rest } from "../../src/domain/combat.js";
import { computeActiveModifiers } from "../../src/domain/modifiers.js";
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
      // Objeto con efectos que escalan con las cargas gastadas (estilo Licor Solar por sorbos).
      { id: "item:licor-test", type: "item", name: "Licor Test", data: { itemType: "wondrous", charges: 5, recharge: "long_rest",
        chargeEffects: [
          { atSpent: 1, mechanics: [{ target: "damage", op: "add", value: "1d6", note: "radiante" }] },
          { atSpent: 2, mechanics: [{ target: "damage", op: "add", value: "2d6", note: "radiante" }, { target: "ac", op: "add", value: 2 }, { target: "damage", op: "resist", note: "radiante" }] },
        ] } },
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

  it("los efectos escalan solos según las cargas gastadas (sorbos)", () => {
    const c = mage();
    const licor = addItem(c, "Licor Test");
    // Sin gastar cargas: no aplica ningún efecto del licor.
    let m = computeActiveModifiers(c);
    expect(m.damage.some((d) => d.includes("radiante"))).toBe(false);
    // 1 sorbo (gasta 1 carga → 4/5): aplica el nivel 1.
    useItemCharges(c, licor.id, 1);
    m = computeActiveModifiers(c);
    expect(m.damage.some((d) => d.includes("1d6"))).toBe(true);
    expect(m.resistances).not.toContain("radiante"); // la resistencia entra a los 2 sorbos
    // 2 sorbos (3/5): sube al nivel 2 (+2d6, +2 CA, resistencia).
    const acBefore = computeActiveModifiers(mage()).ac.final;
    useItemCharges(c, licor.id, 1);
    m = computeActiveModifiers(c);
    expect(m.damage.some((d) => d.includes("2d6"))).toBe(true);
    expect(m.resistances).toContain("radiante");
    expect(m.ac.final).toBe(acBefore + 2);
    // Descanso largo recarga (5/5) → sin sorbos → sin efectos.
    rest(c, "long");
    m = computeActiveModifiers(c);
    expect(m.damage.some((d) => d.includes("radiante"))).toBe(false);
  });
});
