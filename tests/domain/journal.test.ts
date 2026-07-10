import { describe, expect, it } from "vitest";
import {
  addJournalEntry, createCharacter, deleteJournalEntry, updateCharacter, updateJournalEntry,
} from "../../src/domain/characters.js";
import { DomainError } from "../../src/domain/errors.js";
import type { Abilities, Character, Database } from "../../src/types.js";

const ABIL: Abilities = { str: 10, dex: 12, con: 14, int: 10, wis: 10, cha: 8 };
const mk = (): Character => {
  const db: Database = { characters: [] };
  return createCharacter(db, { name: "Diario Test", className: "Fighter", species: "Human", background: "Soldier", abilities: ABIL });
};

describe("diario de campaña", () => {
  it("añade una entrada con fecha, título y campaña", () => {
    const c = mk();
    const e = addJournalEntry(c, { date: "2026-07-09", title: "Sesión 1", campaign: "La Marca", body: "Empezó la aventura." });
    expect(c.journal?.length).toBe(1);
    expect(e.date).toBe("2026-07-09");
    expect(e.title).toBe("Sesión 1");
    expect(e.id).toMatch(/^jrn/);
  });

  it("usa la fecha de hoy si no se especifica", () => {
    const e = addJournalEntry(mk(), { body: "Sin fecha." });
    expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("rechaza una entrada vacía", () => {
    expect(() => addJournalEntry(mk(), { body: "   " })).toThrow(DomainError);
  });

  it("edita y borra entradas; borrar inexistente falla", () => {
    const c = mk();
    const e = addJournalEntry(c, { body: "original" });
    updateJournalEntry(c, e.id, { body: "editado", title: "Título" });
    expect(c.journal?.[0].body).toBe("editado");
    expect(c.journal?.[0].title).toBe("Título");
    deleteJournalEntry(c, e.id);
    expect(c.journal?.length).toBe(0);
    expect(() => deleteJournalEntry(c, e.id)).toThrow(DomainError);
  });
});

describe("personalidad", () => {
  it("guarda y combina rasgos de personalidad, ideales, vínculos y defectos", () => {
    const c = mk();
    updateCharacter(c, { personality: { ideals: "Justicia" } });
    updateCharacter(c, { personality: { bonds: "Protejo a mi pueblo" } });
    expect(c.personality?.ideals).toBe("Justicia");
    expect(c.personality?.bonds).toBe("Protejo a mi pueblo");
  });
});
