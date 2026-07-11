import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCharacter } from "../../src/domain/characters.js";
import { addItem } from "../../src/domain/inventory.js";
import { importPack, removePack } from "../../src/domain/content.js";
import { characterSheet } from "../../src/api/sheet.js";
import type { Abilities, Database } from "../../src/types.js";

const ABIL: Abilities = { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 };
const wizard = () => createCharacter({ characters: [] } as Database,
  { name: "M" + Math.random(), className: "Wizard", level: 3, species: "Human", background: "Sage", abilities: ABIL });
const sheet = (c: ReturnType<typeof wizard>) => characterSheet(c) as { ac: number; saves: Record<string, number>; spellcasting: { attack: number } | null };

beforeAll(async () => {
  await importPack({
    id: "test-ring", name: "objetos test", version: "1.0.0", source: "test",
    entries: [{ id: "item:test-ring", type: "item", name: "Anillo de Prueba", data: { itemType: "wondrous", requiresAttunement: true, bonusAc: 1, bonusSave: 1, bonusSpellAttack: 1 } }],
  });
});
afterAll(async () => { await removePack("test-ring"); });

describe("bonos pasivos de objetos", () => {
  it("un objeto sintonizado aplica +CA, +salvaciones y +ataque de conjuro", () => {
    const c = wizard();
    const s0 = sheet(c);
    const ring = addItem(c, "Anillo de Prueba");
    ring.attuned = true;
    const s1 = sheet(c);
    expect(s1.ac).toBe(s0.ac + 1);
    expect(s1.saves.con).toBe(s0.saves.con + 1);
    expect(s1.saves.dex).toBe(s0.saves.dex + 1);
    expect(s1.spellcasting!.attack).toBe(s0.spellcasting!.attack + 1);
  });

  it("sin sintonizar (ni equipar) no aplica el bono", () => {
    const c = wizard();
    const ac0 = sheet(c).ac;
    addItem(c, "Anillo de Prueba"); // no sintonizado
    expect(sheet(c).ac).toBe(ac0);
  });
});
