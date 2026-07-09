import { beforeEach, describe, expect, it } from "vitest";
// Store en memoria: los tests de dominio prueban lógica sobre `db`, no persistencia.
const loadDb = () => ({ characters: [] as never[] });
const saveDb = (_db: unknown): void => { void _db; };
import {
  createCharacter, deleteCharacter, duplicateCharacter, exportCharacter,
  importCharacter, levelUp, listCharacters, requireCharacter, updateCharacter,
} from "../../src/domain/characters.js";
import type { Abilities, Database } from "../../src/types.js";
import { DomainError } from "../../src/domain/errors.js";

const ABILITIES: Abilities = { str: 10, dex: 14, con: 14, int: 16, wis: 12, cha: 10 };

function freshDb(): Database {
  const db = loadDb();        // primera llamada siembra el pack SRD en el temp dir
  db.characters = [];
  saveDb(db);
  return db;
}

beforeEach(() => {
  freshDb();
});

describe("createCharacter", () => {
  it("calcula PG iniciales = dado de golpe + mod CON (Wizard d6, CON 14 → 8)", () => {
    const db = loadDb();
    const c = createCharacter(db, {
      name: "Mago Uno", className: "Wizard", species: "Human", background: "Sage", abilities: ABILITIES,
    });
    expect(c.hp.max).toBe(8);
    expect(c.hp.current).toBe(8);
  });

  it("deriva salvaciones, habilidad de conjuro y slots de la clase (Wizard)", () => {
    const db = loadDb();
    const c = createCharacter(db, {
      name: "Mago Dos", className: "Wizard", species: "Elf", background: "Sage", abilities: ABILITIES,
    });
    expect(c.proficiencies.saves).toContain("int");
    expect(c.proficiencies.saves).toContain("wis");
    expect(c.spellcasting.ability).toBe("int");
    expect(c.spellcasting.slots["1"]?.max).toBe(2); // full caster nivel 1
  });

  it("rechaza nombre duplicado con DomainError('conflict')", () => {
    const db = loadDb();
    createCharacter(db, { name: "Repetido", className: "Cleric", species: "Human", background: "Acolyte", abilities: ABILITIES });
    expect(() => createCharacter(db, { name: "repetido", className: "Bard", species: "Human", background: "Sage", abilities: ABILITIES }))
      .toThrowError(DomainError);
  });

  it("PG a nivel >1 usa el promedio por nivel adicional", () => {
    const db = loadDb();
    const c = createCharacter(db, {
      name: "Mago Nivel3", className: "Wizard", level: 3, species: "Human", background: "Sage", abilities: ABILITIES,
    });
    // 6 + 2 (nivel 1) + 2×((6/2+1)=4 + 2) = 8 + 12 = 20
    expect(c.hp.max).toBe(20);
  });
});

describe("levelUp", () => {
  it("sube nivel, suma PG y recalcula slots (Wizard 1→2)", () => {
    const db = loadDb();
    const c = createCharacter(db, { name: "Sube", className: "Wizard", species: "Human", background: "Sage", abilities: ABILITIES });
    const res = levelUp(c, {});
    expect(res.classLevel).toBe(2);
    expect(res.levelTotal).toBe(2);
    expect(c.hp.max).toBe(8 + res.hpGained);
    expect(c.spellcasting.slots["1"]?.max).toBe(3); // full caster nivel 2
  });

  it("multiclase: clase nueva se añade a nivel 1", () => {
    const db = loadDb();
    const c = createCharacter(db, { name: "Multi", className: "Wizard", species: "Human", background: "Sage", abilities: ABILITIES });
    const res = levelUp(c, { className: "Cleric" });
    expect(res.isNewClass).toBe(true);
    expect(c.classes).toHaveLength(2);
    expect(c.classes.find((x) => x.name === "Cleric")?.level).toBe(1);
    expect(res.levelTotal).toBe(2);
  });

  it("ASI aumenta característica y respeta el tope de 20", () => {
    const db = loadDb();
    const c = createCharacter(db, { name: "ASI", className: "Fighter", species: "Human", background: "Soldier", abilities: { ...ABILITIES, str: 19 } });
    levelUp(c, { abilityIncreases: { str: 2 } });
    expect(c.abilities.str).toBe(20); // 19 + 2 → capado a 20
  });

  it("rechaza hpRoll mayor que el dado de golpe", () => {
    const db = loadDb();
    const c = createCharacter(db, { name: "MalRoll", className: "Wizard", species: "Human", background: "Sage", abilities: ABILITIES });
    expect(() => levelUp(c, { hpRoll: 99 })).toThrowError(DomainError);
  });
});

describe("delete / list / view", () => {
  it("deleteCharacter sin confirm lanza; con confirm borra", () => {
    const db = loadDb();
    createCharacter(db, { name: "Borrame", className: "Rogue", species: "Halfling", background: "Criminal", abilities: ABILITIES });
    expect(() => deleteCharacter(db, "Borrame", false)).toThrowError(DomainError);
    const res = deleteCharacter(db, "Borrame", true);
    expect(res.deleted).toBe(true);
    expect(listCharacters(db)).toHaveLength(0);
  });

  it("requireCharacter lanza not_found si no existe", () => {
    const db = loadDb();
    try {
      requireCharacter(db, "fantasma");
      expect.unreachable("debió lanzar");
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError);
      expect((e as DomainError).code).toBe("not_found");
    }
  });
});

describe("export / import / duplicate", () => {
  it("exporta a markdown con nombre y CA", () => {
    const db = loadDb();
    const c = createCharacter(db, { name: "Exporta", className: "Wizard", species: "Human", background: "Sage", abilities: ABILITIES });
    const out = exportCharacter(c, "markdown");
    expect(out.format).toBe("markdown");
    if (out.format === "markdown") expect(out.markdown).toContain("# Exporta");
  });

  it("importa con id nuevo y renombra ante colisión", () => {
    const db = loadDb();
    const c = createCharacter(db, { name: "Clon", className: "Wizard", species: "Human", background: "Sage", abilities: ABILITIES });
    const imported = importCharacter(db, JSON.parse(JSON.stringify(c)));
    expect(imported.id).not.toBe(c.id);
    expect(imported.name).toBe("Clon (importado)");
    expect(listCharacters(db)).toHaveLength(2);
  });

  it("duplica de forma independiente del original", () => {
    const db = loadDb();
    const c = createCharacter(db, { name: "Base", className: "Wizard", species: "Human", background: "Sage", abilities: ABILITIES });
    const copy = duplicateCharacter(db, "Base");
    expect(copy.name).toBe("Base (copia)");
    expect(copy.id).not.toBe(c.id);
    copy.hp.current = 1;
    expect(c.hp.current).toBe(8); // el original no cambia
  });
});

describe("updateCharacter", () => {
  it("aplica cambios parciales y añade skills sin duplicar", () => {
    const db = loadDb();
    const c = createCharacter(db, { name: "Edita", className: "Wizard", species: "Human", background: "Sage", abilities: ABILITIES, skills: ["arcana"] });
    updateCharacter(c, { speed: 40, addSkills: ["arcana", "history"], acOverride: 17 });
    expect(c.speed).toBe(40);
    expect(c.acOverride).toBe(17);
    expect(c.proficiencies.skills.sort()).toEqual(["arcana", "history"]);
  });
});
