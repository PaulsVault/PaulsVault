// Convierte el SRD 5.2.1 en markdown (CC-BY-4.0) a un content pack de la app.
// Fuente: https://github.com/downfallx/dnd-5e-srd-markdown  (SRD 5.2.1, © 2024 WotC, CC-BY-4.0)
//
// Uso:  node scripts/build-srd-reference-pack.mjs <ruta-al-repo-srd-md> [salida.json]
// Salida por defecto: src/data/srd-52-reference.json
//
// Deduplica contra src/data/srd-core.json (no repite hechizos/objetos ya presentes)
// y NO incluye condiciones (ya están en srd-core). Mantiene la atribución CC-BY.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRC = process.argv[2];
if (!SRC) {
  console.error("Uso: node scripts/build-srd-reference-pack.mjs <ruta-al-repo-srd-md> [salida.json]");
  process.exit(1);
}
const OUT = process.argv[3] || "src/data/srd-52-reference.json";

const read = (f) => readFileSync(join(SRC, f), "utf-8");
const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const clean = (s) => (s ?? "").replace(/<\/?[^>]+>/g, "").replace(/\*\*/g, "").trim();

const core = JSON.parse(readFileSync("src/data/srd-core.json", "utf-8"));
const existingIds = new Set(core.entries.map((e) => e.id));
const existingKey = new Set(core.entries.map((e) => `${e.type}|${e.name.toLowerCase()}`));

const entries = [];
const seen = new Set();
function add(e) {
  if (!e.name || !e.id) return;
  if (existingIds.has(e.id) || seen.has(e.id)) return;
  if (existingKey.has(`${e.type}|${e.name.toLowerCase()}`)) return;
  seen.add(e.id);
  entries.push(e);
}

/** Divide un markdown en bloques por encabezado `#### Nombre`; el cuerpo llega hasta el próximo encabezado ##/###/####. */
function blocks(md) {
  const out = [];
  let cur = null;
  for (const line of md.split(/\r?\n/)) {
    if (/^#{1,4} /.test(line)) {
      const hm = line.match(/^#### (.+)$/);
      if (cur) out.push(cur);
      cur = hm ? { name: hm[1].trim(), lines: [] } : null;
      continue;
    }
    if (cur) cur.lines.push(line);
  }
  if (cur) out.push(cur);
  return out;
}
const metaOf = (b) => b.lines.find((l) => /^_.*_$/.test(l.trim()))?.trim();
const bodyOf = (b) => clean(b.lines.filter((l) => l.trim() && !/^_.*_$/.test(l.trim())).join("\n").trim());

// ─── Hechizos ───
const SCHOOLS = /Abjuration|Conjuration|Divination|Enchantment|Evocation|Illusion|Necromancy|Transmutation/;
let nSpells = 0;
for (const b of blocks(read("spells.md"))) {
  const meta = metaOf(b);
  if (!meta || !/Cantrip|Level \d+/.test(meta)) continue;
  const level = /Cantrip/.test(meta) ? 0 : parseInt((meta.match(/Level (\d+)/) || [])[1], 10);
  if (Number.isNaN(level)) continue;
  const field = (label) => {
    const l = b.lines.find((x) => x.includes(`**${label}:**`));
    return l ? clean(l.split(`**${label}:**`)[1]) : undefined;
  };
  const castingTime = field("Casting Time");
  const duration = field("Duration");
  const desc = b.lines
    .filter((l) => l.trim() && !/^_.*_$/.test(l.trim()) && !/\*\*(Casting Time|Range|Components|Duration):\*\*/.test(l))
    .join("\n").trim();
  add({
    id: `spell:${slug(b.name)}`, type: "spell", name: b.name,
    data: {
      level,
      school: (meta.match(SCHOOLS) || [])[0],
      classes: ((meta.match(/\(([^)]*)\)/) || [])[1] || "").split(",").map((s) => s.trim()).filter(Boolean),
      castingTime, range: field("Range"), components: field("Components"), duration,
      concentration: /Concentration/i.test(duration || ""),
      ritual: /Ritual/i.test(castingTime || ""),
      summary: clean(desc),
    },
  });
  nSpells++;
}

// ─── Dotes ───
let nFeats = 0;
for (const b of blocks(read("feats.md"))) {
  const meta = metaOf(b);
  if (!meta || !/Feat/i.test(meta)) continue;
  add({ id: `feat:${slug(b.name)}`, type: "feat", name: b.name, data: { category: meta.replace(/_/g, "").trim(), summary: bodyOf(b) } });
  nFeats++;
}

// ─── Objetos mágicos ───
const RARITY = /Common|Uncommon|Rare|Very Rare|Legendary|Artifact/i;
// Mapea la categoría de objeto mágico a un ItemType válido del dominio.
function magicItemType(category) {
  const t = category.toLowerCase();
  if (/armor/.test(t)) return "armor";
  if (/weapon/.test(t)) return "weapon";
  if (/potion|scroll/.test(t)) return "consumable";
  if (/ammunition/.test(t)) return "ammunition";
  return "wondrous"; // Ring, Rod, Staff, Wand, Wondrous Item...
}
let nMagic = 0;
for (const b of blocks(read("magic-items.md"))) {
  const meta = metaOf(b);
  if (!meta || !RARITY.test(meta)) continue;
  const m = meta.replace(/_/g, "");
  const category = m.split(",")[0].trim();
  add({
    id: `item:${slug(b.name)}`, type: "item", name: b.name,
    data: {
      itemType: magicItemType(category),
      magic: true,
      magicCategory: category,
      rarity: (m.match(RARITY) || [])[0],
      requiresAttunement: /Requires Attunement/i.test(m),
      summary: bodyOf(b),
    },
  });
  nMagic++;
}

// ─── Equipo de aventura (#### Nombre (Coste)) ───
let nGear = 0;
for (const b of blocks(read("equipment.md"))) {
  const m = b.name.match(/^(.+?) \(([\d,]+ ?(?:PP|GP|EP|SP|CP)|Varies)\)$/i);
  if (!m) continue;
  add({ id: `item:${slug(m[1])}`, type: "item", name: m[1].trim(), data: { itemType: "gear", cost: m[2], summary: bodyOf(b) } });
  nGear++;
}

// ─── Armas y armaduras (tablas HTML) ───
function parseWeight(w) {
  if (!w) return undefined;
  const f = w.match(/(\d+)\s*\/\s*(\d+)/);
  if (f) return Number(f[1]) / Number(f[2]);
  const n = parseFloat(w);
  return Number.isNaN(n) ? undefined : n;
}
let nWeapons = 0, nArmor = 0;
const eq = read("equipment.md");
for (const t of eq.match(/<table>[\s\S]*?<\/table>/g) || []) {
  const trs = t.match(/<tr>[\s\S]*?<\/tr>/g) || [];
  const parsed = trs.map((tr) => {
    const cat = tr.match(/<th colspan[^>]*>([\s\S]*?)<\/th>/i);
    if (cat) return { category: clean(cat[1]).replace(/_/g, "") };
    return { cells: [...tr.matchAll(/<t[dh]>([\s\S]*?)<\/t[dh]>/g)].map((x) => clean(x[1])) };
  });
  const header = parsed.find((r) => r.cells && r.cells.length)?.cells || [];
  const isWeapon = header.some((c) => /Mastery/i.test(c));
  const isArmor = header.some((c) => /Armor Class/i.test(c));
  if (!isWeapon && !isArmor) continue;
  let category = "";
  for (const r of parsed) {
    if (r.category) { category = r.category; continue; }
    const c = r.cells;
    if (!c || c.length < 5 || /^Name$/i.test(c[0]) || !c[0]) continue;
    if (isWeapon) {
      add({
        id: `item:${slug(c[0])}`, type: "item", name: c[0],
        data: {
          itemType: "weapon", damage: c[1],
          properties: c[2] && c[2] !== "—" ? c[2].split(",").map((s) => s.trim()) : [],
          mastery: c[3] && c[3] !== "—" ? c[3] : undefined,
          weight: parseWeight(c[4]), cost: c[5],
          category, ranged: /Ranged/i.test(category) || /Ammunition/i.test(c[2] || ""),
        },
      });
      nWeapons++;
    } else {
      const cat = /Shield/i.test(category) ? "shield" : /Light/i.test(category) ? "light" : /Medium/i.test(category) ? "medium" : /Heavy/i.test(category) ? "heavy" : undefined;
      add({
        id: `item:${slug(c[0])}`, type: "item", name: c[0],
        data: {
          itemType: cat === "shield" ? "shield" : "armor",
          armorCategory: cat, armorClass: parseInt(c[1], 10), acText: c[1],
          strengthReq: /\d/.test(c[2]) ? parseInt(c[2], 10) : undefined,
          stealthDisadvantage: /Disadvantage/i.test(c[3] || ""),
          weight: parseWeight(c[4]), cost: c[5],
        },
      });
      nArmor++;
    }
  }
}

const pack = {
  id: "srd-52-reference",
  name: "SRD 5.2.1 — Referencia ampliada (D&D 2024)",
  version: "1.0.0",
  source: "System Reference Document 5.2.1, © 2024 Wizards of the Coast LLC. Licencia CC-BY-4.0 (https://creativecommons.org/licenses/by/4.0/). Conversión a markdown por la comunidad (github.com/downfallx/dnd-5e-srd-markdown), no afiliada a WotC.",
  description: "Hechizos, dotes, objetos mágicos, armas, armaduras y equipo del SRD 5.2.1. Complementa srd-core.json; no duplica su contenido.",
  entries,
};
writeFileSync(OUT, JSON.stringify(pack, null, 2));

const byType = entries.reduce((a, e) => ((a[e.type] = (a[e.type] || 0) + 1), a), {});
console.log(`Pack escrito en ${OUT}`);
console.log(`Entradas: ${entries.length} →`, byType);
console.log(`Detalle: spells=${nSpells} feats=${nFeats} magic=${nMagic} gear=${nGear} weapons=${nWeapons} armor=${nArmor} (antes de dedupe)`);
