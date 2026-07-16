import { afterAll, describe, expect, it } from "vitest";
import { createCharacter } from "../../src/domain/characters.js";
import { addItem } from "../../src/domain/inventory.js";
import { computeActiveModifiers } from "../../src/domain/modifiers.js";
import { deleteHomebrewEntry, saveHomebrewEntry } from "../../src/domain/content.js";
import type { Abilities, Database } from "../../src/types.js";

const ABIL: Abilities = { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 };
const mage = () => createCharacter({ characters: [] } as Database,
  { name: "Q" + Math.random(), className: "Wizard", species: "Human", background: "Personalizado", abilities: ABIL });

describe("equipo homebrew", () => {
  afterAll(async () => { await deleteHomebrewEntry("item:anillo-hb-test"); await deleteHomebrewEntry("item:baston-hb-test"); });

  it("un accesorio homebrew se añade, sintoniza y sus bonos pasivos aplican a la hoja", async () => {
    await saveHomebrewEntry({ id: "item:anillo-hb-test", type: "item", name: "Anillo HB Test", data: { itemType: "wondrous", requiresAttunement: true, bonusAc: 1, bonusSave: 1 } });
    const c = mage();
    const it = addItem(c, "Anillo HB Test");
    expect(it.requiresAttunement).toBe(true);
    it.attuned = true;
    const m = computeActiveModifiers(c);
    expect(m.ac.final).toBe(m.ac.base + 1);
    expect(m.saveFlat.dex).toBe(1);
  });

  it("un objeto homebrew con cargas y conjuros se hidrata al añadirlo", async () => {
    await saveHomebrewEntry({ id: "item:baston-hb-test", type: "item", name: "Baston HB Test", data: { itemType: "weapon", charges: 5, recharge: "dawn", spells: [{ cost: 2, name: "Bola de Fuego" }] } });
    const it = addItem(mage(), "Baston HB Test");
    expect(it.charges?.max).toBe(5);
    expect(it.spells?.[0]).toEqual({ cost: 2, name: "Bola de Fuego" });
  });
});
