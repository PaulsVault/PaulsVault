import { beforeEach, describe, expect, it } from "vitest";
import {
  getContentEntry, importPack, listContentPacks, removePack, searchContent,
} from "../../src/domain/content.js";
import { DomainError } from "../../src/domain/errors.js";
import type { ContentPack } from "../../src/types.js";

// El pack SRD se siembra al primer acceso al store (via searchContent → listPacks).
beforeEach(() => {
  // limpia cualquier pack homebrew que un test previo dejara
  for (const p of listContentPacks()) if (p.id !== "srd-core") removePack(p.id);
});

describe("búsqueda y lectura", () => {
  it("lista las 15 condiciones del SRD", () => {
    const r = searchContent("", { type: "condition" });
    expect(r.total).toBe(15);
  });

  it("filtra hechizos por texto", () => {
    const r = searchContent("fire", { type: "spell" });
    expect(r.results.some((e) => e.name === "Fire Bolt")).toBe(true);
  });

  it("getContentEntry devuelve la entrada o lanza not_found", () => {
    expect(getContentEntry("Longsword", "item").type).toBe("item");
    expect(() => getContentEntry("no-existe-xyz")).toThrowError(DomainError);
  });
});

describe("gestión de packs (biblioteca ilimitada)", () => {
  const pack: ContentPack = {
    id: "test-hb", name: "Homebrew de prueba", version: "1.0.0", source: "Homebrew",
    entries: [{ id: "spell:rayo-x", type: "spell", name: "Rayo X", data: { level: 2, classes: ["Wizard"] } }],
  };

  it("importa un pack y su contenido aparece en la búsqueda", () => {
    importPack(pack);
    expect(listContentPacks().some((p) => p.id === "test-hb")).toBe(true);
    expect(searchContent("Rayo X").results.some((e) => e.name === "Rayo X")).toBe(true);
  });

  it("reimportar el mismo id actualiza (no duplica)", () => {
    importPack(pack);
    importPack({ ...pack, version: "2.0.0" });
    expect(listContentPacks().filter((p) => p.id === "test-hb")).toHaveLength(1);
    expect(listContentPacks().find((p) => p.id === "test-hb")?.version).toBe("2.0.0");
  });

  it("rechaza un pack sin entradas", () => {
    expect(() => importPack({ id: "vacio", name: "Vacío", version: "1", source: "x", entries: [] }))
      .toThrowError(DomainError);
  });

  it("removePack borra y luego lanza si no existe", () => {
    importPack(pack);
    expect(removePack("test-hb").removed).toBe(true);
    expect(() => removePack("test-hb")).toThrowError(DomainError);
  });
});
