import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCharacter } from "../../src/domain/characters.js";
import { importPack, removePack } from "../../src/domain/content.js";
import { characterSheet } from "../../src/api/sheet.js";
import type { Abilities, Database } from "../../src/types.js";

const ABIL: Abilities = { str: 12, dex: 16, con: 14, int: 8, wis: 14, cha: 10 };

beforeAll(async () => {
  await importPack({
    id: "test-cf", name: "rasgos test", version: "1.0.0", source: "test",
    entries: [{ id: "classfeature:monk-1-ma", type: "classfeature", name: "Martial Arts", data: { class: "Monk", level: 1, summary: "Dominas artes marciales sin armas." } }],
  });
});
afterAll(async () => { await removePack("test-cf"); });

describe("hoja: descripción de rasgos de clase", () => {
  it("enriquece un rasgo de clase (solo nombre) con la descripción del contenido", () => {
    const c = createCharacter({ characters: [] } as Database,
      { name: "Monje", className: "Monk", level: 1, species: "Human", background: "Soldier", abilities: ABIL });
    const sheet = characterSheet(c) as { features: { name: string; description: string | null }[] };
    const ma = sheet.features.find((f) => f.name === "Martial Arts");
    expect(ma).toBeTruthy();
    expect(ma!.description).toContain("artes marciales");
  });
});
