import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCharacter } from "../../src/domain/characters.js";
import { rest } from "../../src/domain/combat.js";
import { adjustWildShape, eligibleBeasts, wildShapeState } from "../../src/domain/wildshape.js";
import { importPack, removePack } from "../../src/domain/content.js";
import { DomainError } from "../../src/domain/errors.js";
import type { Abilities, Database } from "../../src/types.js";

const ABIL: Abilities = { str: 10, dex: 14, con: 14, int: 10, wis: 16, cha: 8 };
const make = (level: number, className = "Druid") =>
  createCharacter({ characters: [] } as Database, { name: "D" + Math.random(), className, level, species: "Human", background: "Sage", abilities: ABIL });

beforeAll(async () => {
  await importPack({
    id: "test-wildshape", name: "ws test", version: "1.0.0", source: "test", entries: [
      { id: "monster:wolf-test", type: "monster", name: "Wolf Test", data: { creatureType: "beast", cr: "1/4", size: "Medium", ac: 12, hp: { average: 11 }, speed: "40 ft" } },
      { id: "monster:eagle-test", type: "monster", name: "Eagle Test", data: { creatureType: "beast", cr: "0", size: "Small", ac: 12, hp: { average: 4 }, speed: "10 ft, fly 60 ft" } },
      { id: "monster:panther-test", type: "monster", name: "Panther Test", data: { creatureType: "beast", cr: "1/2", size: "Medium", ac: 13, hp: { average: 13 }, speed: "50 ft, climb 40 ft" } },
      { id: "monster:bear-test", type: "monster", name: "Bear Test", data: { creatureType: "beast", cr: "1", size: "Large", ac: 12, hp: { average: 34 }, speed: "40 ft" } },
      { id: "monster:guard-test", type: "monster", name: "Guard Test", data: { creatureType: "humanoid", cr: "1/8", size: "Medium", ac: 16, hp: { average: 11 }, speed: "30 ft" } },
    ],
  });
});
afterAll(async () => { await removePack("test-wildshape"); });

describe("Forma Salvaje (Druida 2024)", () => {
  it("no está disponible antes de nivel 2", () => {
    expect(wildShapeState(make(1))).toBeNull();
    expect(wildShapeState(make(5, "Wizard"))).toBeNull();
  });

  it("los usos y límites siguen la tabla por nivel", () => {
    const l2 = wildShapeState(make(2))!;
    expect(l2.maxUses).toBe(2); expect(l2.maxCRLabel).toBe("1/4"); expect(l2.fly).toBe(false);
    const l6 = wildShapeState(make(6))!;
    expect(l6.maxUses).toBe(3); expect(l6.maxCRLabel).toBe("1/2"); // CR sube a nivel 4
    const l8 = wildShapeState(make(8))!;
    expect(l8.maxCRLabel).toBe("1"); expect(l8.fly).toBe(true);
    expect(wildShapeState(make(17))!.maxUses).toBe(4);
  });

  it("filtra bestias por CR y bloquea el vuelo hasta nivel 8", () => {
    const at2 = eligibleBeasts(make(2)).map((b) => b.name);
    expect(at2).toContain("Wolf Test");     // CR 1/4 ✓
    expect(at2).not.toContain("Panther Test"); // CR 1/2 > 1/4
    expect(at2).not.toContain("Eagle Test");   // vuela (nivel < 8)
    expect(at2).not.toContain("Guard Test");   // no es bestia

    const at8 = eligibleBeasts(make(8)).map((b) => b.name);
    expect(at8).toContain("Bear Test");   // CR 1 ✓
    expect(at8).toContain("Eagle Test");  // ahora sí (vuelo desde nivel 8)
  });

  it("gasta y restaura usos respetando 0..máximo", () => {
    const c = make(2); // máx 2
    adjustWildShape(c, 1); expect(c.wildShape!.used).toBe(1);
    adjustWildShape(c, 5); expect(c.wildShape!.used).toBe(2); // tope
    adjustWildShape(c, -9); expect(c.wildShape!.used).toBe(0);
  });

  it("el descanso corto recupera 1 uso y el largo todos", () => {
    const c = make(6); // máx 3
    adjustWildShape(c, 3); expect(c.wildShape!.used).toBe(3);
    rest(c, "short"); expect(c.wildShape!.used).toBe(2);
    rest(c, "long"); expect(c.wildShape!.used).toBe(0);
  });

  it("un no-druida no puede usar Forma Salvaje", () => {
    expect(() => adjustWildShape(make(5, "Wizard"), 1)).toThrow(DomainError);
  });
});
