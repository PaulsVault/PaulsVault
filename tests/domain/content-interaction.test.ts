// Verifica que el contenido del pack de referencia (SRD 5.2.1) interactúa bien con
// el personaje y su hoja: equipar recalcula CA, objetos mágicos con tipo válido y
// sintonización, y hechizos del pack se aprenden/lanzan.
import { beforeEach, describe, expect, it } from "vitest";
import { loadDb, saveDb } from "../../src/store.js";
import { createCharacter } from "../../src/domain/characters.js";
import { addItem, equipItem, requireItem } from "../../src/domain/inventory.js";
import { castSpell, learnSpell } from "../../src/domain/spells.js";
import { computeAC } from "../../src/rules.js";
import type { Abilities, Character } from "../../src/types.js";

const ABIL: Abilities = { str: 14, dex: 12, con: 12, int: 16, wis: 10, cha: 10 };
const VALID_ITEM_TYPES = ["weapon", "armor", "shield", "tool", "gear", "consumable", "wondrous", "ammunition", "container", "treasure", "other"];

function fighter(): Character {
  const db = loadDb();
  db.characters = [];
  saveDb(db);
  return createCharacter(db, { name: "Aventurero", className: "Fighter", species: "Human", background: "Soldier", abilities: ABIL });
}
function wizard(): Character {
  const db = loadDb();
  db.characters = [];
  saveDb(db);
  return createCharacter(db, { name: "Mago Pack", className: "Wizard", species: "Human", background: "Sage", abilities: ABIL });
}

beforeEach(() => {
  const db = loadDb();
  db.characters = [];
  saveDb(db);
});

it("un arma del pack (Sickle) se añade como arma con daño", () => {
  const c = fighter();
  const it = addItem(c, "Sickle");
  expect(it.type).toBe("weapon");
  expect(it.damage).toMatch(/1d4/);
});

it("una armadura del pack (Ring Mail) equipada recalcula la CA a su valor pesado (14)", () => {
  const c = fighter();
  addItem(c, "Ring Mail");
  equipItem(c, "Ring Mail");
  expect(computeAC(c).ac).toBe(14);
});

it("un objeto mágico del pack tiene ItemType válido y hereda la sintonización del contenido", () => {
  const c = fighter();
  addItem(c, "Amulet of Health");
  const it = requireItem(c, "Amulet of Health");
  expect(VALID_ITEM_TYPES).toContain(it.type); // ya no "magic"
  expect(it.type).toBe("wondrous");
  expect(it.requiresAttunement).toBe(true);
});

it("un hechizo del pack (Mage Armor) se aprende y se lanza consumiendo slot", () => {
  const c = wizard();
  const s = learnSpell(c, "Mage Armor");
  expect(s.level).toBe(1);
  castSpell(c, { spell: "Mage Armor" });
  expect(c.spellcasting.slots["1"].used).toBe(1);
});
