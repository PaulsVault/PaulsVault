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
const cap = (s) => s.replace(/(^|\s)\w/g, (c) => c.toUpperCase()); // no capitaliza tras apóstrofo
const SMALL_WORDS = new Set(["of", "the", "and", "a", "to", "in", "on", "from", "with", "for"]);
const titleCase = (s) => s.split(" ").map((w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
const SIZE = { T: "Tiny", S: "Small", M: "Medium", L: "Large", H: "Huge", G: "Gargantuan" };

// "magic initiate; cleric|xphb" → "Magic Initiate (Cleric)"
function refName(ref) {
  const base = String(ref).split("|")[0];
  const [name, sub] = base.split(";").map((s) => s.trim());
  return sub ? `${cap(name)} (${cap(sub)})` : cap(name);
}
function renderPrereq(pre) {
  if (!Array.isArray(pre)) return undefined;
  const parts = [];
  for (const p of pre) {
    if (p.level) parts.push(`Nivel ${p.level.level ?? p.level}`);
    if (p.ability) for (const a of p.ability) for (const [k, v] of Object.entries(a)) parts.push(`${k.toUpperCase()} ${v}`);
    if (p.race) parts.push(p.race.map((r) => cap(r.name ?? r)).join("/"));
    if (p.spellcasting || p.spellcasting2020) parts.push("saber lanzar conjuros");
    if (p.other) parts.push(deTag(p.other));
  }
  return parts.length ? parts.join(", ") : undefined;
}

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

// ─── Dotes ───
function convertFeat(ft) {
  return { id: slug(ft.name, "feat"), type: "feat", name: ft.name, data: {
    summary: text(ft.entries),
    category: ft.category,
    prerequisite: renderPrereq(ft.prerequisite),
    source: ft.source,
  } };
}
if (want("feats")) {
  const entries = [];
  for (const ft of readJson(path.join(DATA_DIR, "feats.json")).feat ?? []) {
    if (!SOURCES_2024.has(ft.source) || ft.name === "Ability Score Improvement") continue;
    entries.push(convertFeat(ft));
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  writePack("dnd2024-feats", "D&D 2024 — Dotes", "D&D 2024 (uso privado; © Wizards of the Coast)", entries);
}

// ─── Trasfondos ───
function convertBackground(bg) {
  const featKey = bg.feats?.[0] ? Object.keys(bg.feats[0])[0] : undefined;
  const skills = bg.skillProficiencies?.[0]
    ? Object.keys(bg.skillProficiencies[0]).filter((k) => k !== "choose" && k !== "any")
    : [];
  // Las 3 características que el trasfondo permite mejorar (+2/+1 en 2024).
  const abilities = bg.ability?.[0]?.choose?.weighted?.from ?? bg.ability?.[0]?.choose?.from ?? [];
  // Herramienta con competencia (primera concreta; "anyGamingSet" → "Gaming Set").
  let toolKey = bg.toolProficiencies?.[0]
    ? Object.keys(bg.toolProficiencies[0]).filter((k) => k !== "choose" && k !== "any")[0]
    : undefined;
  if (toolKey) toolKey = cap(toolKey.split("|")[0].replace(/^any/i, "").replace(/([a-z])([A-Z])/g, "$1 $2").trim());
  return { id: slug(bg.name, "background"), type: "background", name: bg.name, data: {
    feat: featKey ? refName(featKey) : undefined,
    abilities,
    skills,
    tool: toolKey || undefined,
    summary: text(bg.entries),
    source: bg.source,
  } };
}
if (want("backgrounds")) {
  const entries = [];
  for (const bg of readJson(path.join(DATA_DIR, "backgrounds.json")).background ?? []) {
    if (!SOURCES_2024.has(bg.source) || bg._copy) continue;
    entries.push(convertBackground(bg));
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  writePack("dnd2024-backgrounds", "D&D 2024 — Trasfondos", "D&D 2024 (uso privado; © Wizards of the Coast)", entries);
}

// ─── Especies ───
function convertRace(r) {
  const speed = typeof r.speed === "number" ? r.speed : (r.speed?.walk ?? 30);
  // Los rasgos ya vienen descritos en las entradas (incluida la visión en la oscuridad y resistencias);
  // no los duplicamos con texto propio en español.
  const traits = (r.entries ?? []).filter((e) => e && e.name).map((e) => `${deTag(e.name)}: ${text(e.entries)}`);
  return { id: slug(r.name, "species"), type: "species", name: r.name, data: {
    size: (r.size ?? ["M"]).map((s) => SIZE[s] ?? s).join(" o "),
    speed,
    traits,
    source: r.source,
  } };
}
if (want("species")) {
  const entries = [];
  for (const r of readJson(path.join(DATA_DIR, "races.json")).race ?? []) {
    if (!SOURCES_2024.has(r.source) || r._copy) continue;
    entries.push(convertRace(r));
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  writePack("dnd2024-species", "D&D 2024 — Especies", "D&D 2024 (uso privado; © Wizards of the Coast)", entries);
}

// ─── Objetos y equipo ───
const ITEM_TYPE = {
  M: "weapon", R: "weapon", A: "ammunition", AF: "ammunition",
  LA: "armor", MA: "armor", HA: "armor", S: "shield",
  P: "consumable", SC: "consumable",
  RD: "wondrous", WD: "wondrous", RG: "wondrous", W: "wondrous",
  AT: "tool", T: "tool", INS: "tool", GS: "tool",
  $: "treasure", TG: "treasure", $C: "treasure",
  G: "gear", SCF: "gear", OTH: "other", MNT: "other", VEH: "other", SHP: "other", AIR: "other",
};
const ARMOR_CAT = { LA: "light", MA: "medium", HA: "heavy", S: "shield" };
const DMG_TYPE = { S: "slashing", P: "piercing", B: "bludgeoning" };
const PROP = { F: "finesse", L: "light", H: "heavy", T: "thrown", V: "versatile", A: "ammunition", R: "reach", "2H": "two-handed", LD: "loading", RLD: "reload", S: "special", BF: "burst fire", RN: "range", N: "net" };
const stripSrc = (s) => String(s).split("|")[0];

function costStr(value) {
  if (value == null) return undefined;
  if (value % 100 === 0) return `${value / 100} gp`;
  if (value % 10 === 0) return `${value / 10} sp`;
  return `${value} cp`;
}

function convertItem(it) {
  const code = it.type ? stripSrc(it.type) : (it.weapon ? "M" : it.armor ? "LA" : it.wondrous ? "W" : "G");
  const itemType = ITEM_TYPE[code] ?? (it.weapon ? "weapon" : it.armor ? "armor" : it.wondrous ? "wondrous" : "gear");
  const props = (it.property ?? []).map((p) => PROP[stripSrc(p)] ?? stripSrc(p).toLowerCase());
  if (Array.isArray(it.mastery)) props.push(`maestría: ${it.mastery.map(stripSrc).join("/")}`);
  const bonus = it.bonusWeapon ?? it.bonusAc ?? it.bonusSpellAttack ?? it.bonusWeaponAttack;
  const magicBonus = bonus ? Number(String(bonus).replace(/[^\d-]/g, "")) || undefined : undefined;
  const head = [];
  if (it.rarity && it.rarity !== "none") head.push(`Rareza: ${it.rarity}.`);
  if (it.reqAttune) head.push(typeof it.reqAttune === "string" ? `Requiere sintonización ${it.reqAttune}.` : "Requiere sintonización.");
  const description = [head.join(" "), text(it.entries)].filter(Boolean).join(" ") || undefined;
  const n = (v) => (v != null ? (Number(String(v).replace(/[^\d-]/g, "")) || undefined) : undefined);
  // Conjuros del objeto con su coste en cargas: { "1": [spells], "5": [...] } → [{ cost, name }].
  let spells;
  if (it.attachedSpells?.charges) {
    spells = [];
    for (const [cost, list] of Object.entries(it.attachedSpells.charges)) {
      for (const s of list) spells.push({ cost: Number(cost), name: titleCase(stripSrc(s)) });
    }
  }
  return { id: slug(it.name, "item"), type: "item", name: it.name, data: {
    itemType,
    weight: it.weight,
    cost: costStr(it.value),
    requiresAttunement: !!it.reqAttune,
    armorClass: it.ac,
    armorCategory: ARMOR_CAT[code],
    damage: it.dmg1 ? `${it.dmg1} ${DMG_TYPE[it.dmgType] ?? it.dmgType ?? ""}`.trim() : undefined,
    properties: props.length ? props : undefined,
    magicBonus,
    rarity: it.rarity && it.rarity !== "none" ? it.rarity : undefined,
    // Cargas y recarga (objetos con cargas).
    charges: typeof it.charges === "number" ? it.charges : undefined,
    recharge: it.recharge,
    rechargeAmount: it.rechargeAmount ? deTag(it.rechargeAmount) : undefined,
    spells,
    // Bonos pasivos mientras se lleva/sintoniza.
    bonusAc: n(it.bonusAc),
    bonusSave: n(it.bonusSavingThrow),
    bonusSpellAttack: n(it.bonusSpellAttack),
    bonusSpellDc: n(it.bonusSpellSaveDc),
    description,
    source: it.source,
  } };
}
if (want("items")) {
  const entries = [];
  const seen = new Set();
  const add = (arr) => {
    for (const it of arr ?? []) {
      if (!SOURCES_2024.has(it.source) || it._copy) continue;
      const e = convertItem(it);
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      entries.push(e);
    }
  };
  add(readJson(path.join(DATA_DIR, "items-base.json")).baseitem);
  add(readJson(path.join(DATA_DIR, "items.json")).item);
  entries.sort((a, b) => a.name.localeCompare(b.name));
  writePack("dnd2024-items", "D&D 2024 — Objetos y equipo", "D&D 2024 (uso privado; © Wizards of the Coast)", entries);
}

// ─── Subclases (con rasgos por nivel) ───
function convertSubclasses(classJson) {
  const features = classJson.subclassFeature ?? [];
  const out = [];
  for (const sc of classJson.subclass ?? []) {
    if (!SOURCES_2024.has(sc.source)) continue;
    const feats = features
      .filter((f) => f.className === sc.className && f.subclassShortName === sc.shortName && f.subclassSource === sc.source)
      .sort((a, b) => a.level - b.level)
      .map((f) => ({ level: f.level, name: f.name, summary: text(f.entries) }));
    const introIdx = feats.findIndex((f) => f.name === sc.name); // rasgo introductorio = descripción de la subclase
    const summary = (introIdx >= 0 ? feats[introIdx].summary : feats[0]?.summary) ?? "";
    out.push({ id: slug(sc.name, "subclass"), type: "subclass", name: sc.name, data: {
      class: sc.className,
      summary,
      features: feats.filter((_, i) => i !== introIdx),
      source: sc.source,
    } });
  }
  return out;
}
if (want("subclasses")) {
  const dir = path.join(DATA_DIR, "class");
  const entries = [];
  const seen = new Set();
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith("class-") || !f.endsWith(".json")) continue;
    for (const e of convertSubclasses(readJson(path.join(dir, f)))) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      entries.push(e);
    }
  }
  entries.sort((a, b) => a.data.class.localeCompare(b.data.class) || a.name.localeCompare(b.name));
  writePack("dnd2024-subclasses", "D&D 2024 — Subclases", "D&D 2024 (uso privado; © Wizards of the Coast)", entries);
}

// ─── Rasgos de clase (descripciones por nivel) ───
if (want("classfeatures")) {
  const dir = path.join(DATA_DIR, "class");
  const entries = [];
  const seen = new Set();
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith("class-") || !f.endsWith(".json")) continue;
    const j = readJson(path.join(dir, f));
    for (const cf of j.classFeature ?? []) {
      if (!SOURCES_2024.has(cf.source)) continue;
      const id = slug(`${cf.className}-${cf.level}-${cf.name}`, "classfeature");
      if (seen.has(id)) continue;
      seen.add(id);
      entries.push({ id, type: "classfeature", name: cf.name, data: { class: cf.className, level: cf.level, summary: text(cf.entries), source: cf.source } });
    }
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  writePack("dnd2024-classfeatures", "D&D 2024 — Rasgos de clase", "D&D 2024 (uso privado; © Wizards of the Coast)", entries);
}

// ─── Opciones de clase (invocaciones, metamagia, maniobras…) ───
if (want("optionalfeatures")) {
  const entries = [];
  const seen = new Set();
  for (const of of readJson(path.join(DATA_DIR, "optionalfeatures.json")).optionalfeature ?? []) {
    if (!SOURCES_2024.has(of.source)) continue;
    const id = slug(of.name, "optionalfeature");
    if (seen.has(id)) continue;
    seen.add(id);
    entries.push({ id, type: "optionalfeature", name: of.name, data: {
      featureType: of.featureType,
      prerequisite: renderPrereq(of.prerequisite),
      summary: text(of.entries),
      source: of.source,
    } });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  writePack("dnd2024-optionalfeatures", "D&D 2024 — Opciones de clase", "D&D 2024 (uso privado; © Wizards of the Coast)", entries);
}
