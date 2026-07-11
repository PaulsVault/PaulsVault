import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCharacter } from "../../src/domain/characters.js";
import { addItem, useItem } from "../../src/domain/inventory.js";
import { importPack, removePack } from "../../src/domain/content.js";
import type { Abilities, Database } from "../../src/types.js";

const ABIL: Abilities = { str: 10, dex: 14, con: 14, int: 10, wis: 12, cha: 16 };
const bard = () => createCharacter({ characters: [] } as Database,
  { name: "B" + Math.random(), className: "Bard", level: 5, species: "Human", background: "Sage", abilities: ABIL });

beforeAll(async () => {
  await importPack({
    id: "test-horn", name: "objetos test", version: "1.0.0", source: "test",
    entries: [
      { id: "item:test-horn", type: "item", name: "Cuerno de Prueba", data: { itemType: "tool", requiresAttunement: true, description: "You take a Magic action to blow the horn, emitting a blast in a 30-foot Cone. Each creature makes a DC 15 Constitution saving throw, taking 5d8 Thunder damage on a failed save. Each use has a 0 percent chance of causing the horn to explode. The explosion deals 10d6 Force damage to the user." } },
      { id: "item:test-bomb", type: "item", name: "Bomba de Prueba", data: { itemType: "tool", description: "Each use has a 100 percent chance of causing it to explode. The explosion deals 10d6 Force damage to the user." } },
    ],
  });
});
afterAll(async () => { await removePack("test-horn"); });

describe("objetos activos sin cargas", () => {
  it("usar un objeto activo devuelve el efecto (salvación, daño, área)", () => {
    const c = bard();
    const horn = addItem(c, "Cuerno de Prueba"); horn.attuned = true;
    const r = useItem(c, horn.id);
    expect(r.saveDC).toBe(15);
    expect(r.mechanics.save).toBe("con");
    expect(r.mechanics.damage).toBe("5d8");
    expect(r.mechanics.shape).toBe("cone");
    expect(r.destroyed).toBeFalsy(); // 0% de explotar
  });

  it("un objeto con 100% de explotar se destruye al usarlo", () => {
    const c = bard();
    const bomb = addItem(c, "Bomba de Prueba");
    const r = useItem(c, bomb.id);
    expect(r.destroyed).toBe(true);
    expect(r.selfDamage).toBe("10d6");
    expect(c.inventory.some((x) => x.id === bomb.id)).toBe(false);
  });

  it("requiere sintonía", () => {
    const c = bard();
    const horn = addItem(c, "Cuerno de Prueba"); // no sintonizado
    expect(() => useItem(c, horn.id)).toThrow();
  });
});
