// Convierte datos de 5etools (formato JSON propio) a content packs de esta app.
// USO PRIVADO: la salida va a data-private/ (gitignored) y se importa a Turso con
// scripts/import-packs.mjs. El repo público NUNCA contiene contenido con copyright.
//
//   node scripts/convert-5etools.mjs <ruta-a-5etools/data> [tipo...]
//   (o define FIVE_ETOOLS_DATA). Tipos: spells (por ahora). Sin tipo = todos los soportados.
//
// El material de WotC 2024 es propiedad de Wizards of the Coast; conviértelo solo para
// contenido que poseas y úsalo de forma privada.

import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.argv[2] || process.env.FIVE_ETOOLS_DATA;
if (!DATA_DIR || !fs.existsSync(DATA_DIR)) {
  console.error("Falta la ruta a 5etools/data. Uso: node scripts/convert-5etools.mjs <ruta/data> [spells ...]");
  process.exit(1);
}
const TYPES = process.argv.slice(3);
const want = (t) => TYPES.length === 0 || TYPES.includes(t);

const OUT_DIR = path.resolve("data-private");
fs.mkdirSync(OUT_DIR, { recursive: true });

// Fuentes 2024 que queremos importar (abreviaturas de 5etools).
const SOURCES_2024 = new Set(["XPHB", "XDMG", "XMM"]);

const SCHOOL = { A: "Abjuration", C: "Conjuration", D: "Divination", E: "Enchantment", V: "Evocation", I: "Illusion", N: "Necromancy", T: "Transmutation" };
const AREA_SHAPE = { S: "sphere", N: "cone", L: "line", C: "cube", Y: "cylinder", H: "emanation", R: "emanation", Q: "cube", W: "line" };

// ─── Renderizado del markup {@tag ...} de 5etools a texto plano ───
function deTag(s) {
  if (typeof s !== "string") return String(s ?? "");
  return s.replace(/\{@(\w+)\s*([^{}]*)\}/g, (_, tag, body) => {
    const parts = body.split("|");
    // {@scaledamage base|niveles|incremento} y {@scaledice ...} muestran el INCREMENTO (última parte).
    if (tag === "scaledamage" || tag === "scaledice") return parts[parts.length - 1] || parts[0] || "";
    if (tag === "dc") return `DC ${parts[0]}`;
    if (tag === "hit") return (Number(parts[0]) >= 0 ? "+" : "") + parts[0];
    if (tag === "chance") return `${parts[0]} percent`;
    let text = parts.length >= 3 ? parts[2] : parts[0];
    if (!text) text = parts[0] || "";
    return text.replace(/\s*\[[^\]]*\]/g, "").trim();
  });
}

function renderEntries(entries, acc = []) {
  for (const e of entries ?? []) {
    if (typeof e === "string") acc.push(deTag(e));
    else if (e && typeof e === "object") {
      if (e.name && (e.type === "entries" || e.type === "inset")) acc.push(`${deTag(e.name)}.`);
      if (Array.isArray(e.entries)) renderEntries(e.entries, acc);
      if (Array.isArray(e.items)) renderEntries(e.items, acc);
      if (e.type === "list" && Array.isArray(e.items)) { /* ya cubierto */ }
    }
  }
  return acc;
}
const text = (entries) => renderEntries(entries).join(" ").replace(/\s+/g, " ").trim();

const slug = (name, type) => `${type}:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

function writePack(id, name, source, entries) {
  const pack = { id, name, version: "1.0.0", source, description: `${entries.length} entradas convertidas de 5etools (uso privado).`, entries };
  const file = path.join(OUT_DIR, `${id}.json`);
  fs.writeFileSync(file, JSON.stringify(pack, null, 2));
  console.log(`✓ ${id}: ${entries.length} entradas → ${path.relative(process.cwd(), file)}`);
}

// ─── Renderizadores de campos de hechizo ───
function renderTime(time) {
  const t = time?.[0]; if (!t) return "Action";
  const unit = t.unit === "bonus" ? "bonus action" : t.unit;
  return t.number > 1 || unit !== "action" ? `${t.number} ${unit}${t.number > 1 ? "s" : ""}` : "Action";
}
function renderRange(range) {
  if (!range) return "Self";
  if (range.type === "point") {
    const d = range.distance;
    if (!d) return "Self";
    if (d.type === "touch") return "Touch";
    if (d.type === "self") return "Self";
    if (d.type === "sight" || d.type === "unlimited") return d.type;
    return `${d.amount} ${d.type}`;
  }
  const d = range.distance;
  const shape = range.type.charAt(0).toUpperCase() + range.type.slice(1);
  return d ? `Self (${d.amount}-${d.type} ${shape})` : range.type;
}
function renderComponents(c) {
  if (!c) return "";
  const out = [];
  if (c.v) out.push("V");
  if (c.s) out.push("S");
  if (c.m) out.push(typeof c.m === "string" ? `M (${c.m})` : c.m.text ? `M (${c.m.text})` : "M");
  return out.join(", ");
}
function renderDuration(dur) {
  const d = dur?.[0]; if (!d) return "Instantaneous";
  if (d.type === "instant") return "Instantaneous";
  if (d.type === "permanent") return "Until dispelled";
  if (d.type === "special") return "Special";
  const body = d.duration ? `${d.duration.amount} ${d.duration.type}${d.duration.amount > 1 ? "s" : ""}` : "";
  return d.concentration ? `Concentration, up to ${body}` : body;
}

function convertSpell(sp) {
  const concentration = (sp.duration ?? []).some((d) => d.concentration);
  // entriesHigherLevel ya incluye su propio título ("Using a Higher-Level Spell Slot.") vía renderEntries.
  const higher = sp.entriesHigherLevel ? text(sp.entriesHigherLevel) : undefined;
  const summary = text(sp.entries) + (higher ? ` ${higher}` : "");
  const data = {
    level: sp.level,
    school: SCHOOL[sp.school] ?? sp.school,
    castingTime: renderTime(sp.time),
    range: renderRange(sp.range),
    components: renderComponents(sp.components),
    duration: renderDuration(sp.duration),
    concentration,
    ritual: !!sp.meta?.ritual,
    summary,
    source: sp.source,
    // Mecánica estructurada (preferida por spellMechanics cuando exista):
    savingThrow: sp.savingThrow,           // p.ej. ["dexterity"]
    damageInflict: sp.damageInflict,       // p.ej. ["fire"]
    spellAttack: sp.spellAttack,           // p.ej. ["R"] / ["M"]
    scalingLevelDice: sp.scalingLevelDice, // escalado de trucos
    areaTags: sp.areaTags,                 // p.ej. ["S"]
  };
  return { id: slug(sp.name, "spell"), type: "spell", name: sp.name, data };
}

if (want("spells")) {
  const dir = path.join(DATA_DIR, "spells");
  const entries = [];
  const seen = new Set();
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith("spells-") || !f.endsWith(".json")) continue;
    const json = readJson(path.join(dir, f));
    for (const sp of json.spell ?? []) {
      if (!SOURCES_2024.has(sp.source)) continue;
      const e = convertSpell(sp);
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      entries.push(e);
    }
  }
  entries.sort((a, b) => a.data.level - b.data.level || a.name.localeCompare(b.name));
  writePack("dnd2024-spells", "D&D 2024 — Hechizos", "D&D 2024 (uso privado; © Wizards of the Coast)", entries);
}
