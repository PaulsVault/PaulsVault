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
    // Etiquetas de stat block de monstruo (para descripciones legibles).
    if (tag === "atk" || tag === "atkr") { const A = { m: "Melee Attack Roll:", r: "Ranged Attack Roll:", mw: "Melee Weapon Attack:", rw: "Ranged Weapon Attack:", ms: "Melee Spell Attack:", rs: "Ranged Spell Attack:" }; return A[(parts[0] || "").trim()] ?? "Attack Roll:"; }
    if (tag === "h") return "Hit: ";
    if (tag === "recharge") return parts[0] ? `(Recharge ${parts[0]}-6)` : "(Recharge)";
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

// ─── Conjuros otorgados (additionalSpells) → estructura {fixed, choices, ability} ───
// "light|xphb#c" → "Light". Quita fuente (|...) y sufijos (#c = cantrip).
function spellRefName(ref) {
  return titleCase(String(ref).split("|")[0].split("#")[0].trim());
}
function collectGrantList(val, level, fixed, choices) {
  if (Array.isArray(val)) {
    for (const item of val) {
      if (typeof item === "string") fixed.push({ level, name: spellRefName(item) });
      else choices.push({ level }); // entrada de elección (linaje, escuela, etc.)
    }
  } else if (val && typeof val === "object") {
    if (val.choose || val.chooseFrom || val.all) { choices.push({ level }); return; }
    for (const v of Object.values(val)) collectGrantList(v, level, fixed, choices);
  }
}
// Devuelve solo lo "siempre disponible" (known/prepared). innate/will (X/día) se omiten por ahora.
// Si hay VARIOS grupos, son variantes a elegir (linaje del Tiefling, tipo de Círculo de la Tierra):
// no se auto-otorgan, se marcan como elección.
function parseAdditionalSpells(add) {
  if (!Array.isArray(add) || !add.length) return undefined;
  const fixed = [];
  const choices = [];
  let ability;
  const multiVariant = add.length > 1;
  for (const grp of add) {
    if (typeof grp.ability === "string") ability = grp.ability;
    for (const kind of ["known", "prepared"]) {
      const byLevel = grp[kind];
      if (!byLevel || typeof byLevel !== "object") continue;
      for (const [lvl, list] of Object.entries(byLevel)) {
        if (multiVariant) choices.push({ level: Number(lvl) });
        else collectGrantList(list, Number(lvl), fixed, choices);
      }
    }
  }
  if (!fixed.length && !choices.length) return undefined;
  const out = {};
  if (fixed.length) out.grantedSpells = fixed;
  if (choices.length) out.grantedSpellChoices = [...new Set(choices.map((c) => c.level))].map((level) => ({ level }));
  if (ability) out.grantedSpellAbility = ability;
  return out;
}

// ─── Ascendencias/linajes de raza (Giant Ancestry del Goliath, linaje del Elfo, etc.) ───
// Extrae, por rasgo de "elige uno", las opciones con su descripción. Cubre 3 patrones de 5etools:
// lista con items nombrados, tabla, y _versions (linajes/legados).
function extractAncestryChoices(r) {
  const out = [];
  const seenTraits = new Set();
  for (const e of r.entries ?? []) {
    if (!e || !e.name || !Array.isArray(e.entries)) continue;
    const intro = e.entries.filter((x) => typeof x === "string").join(" ");
    if (!/\bchoose\b/i.test(intro)) continue;
    // Patrón 1: lista con items nombrados (Goliath, Aasimar…).
    const list = e.entries.find((x) => x && x.type === "list" && Array.isArray(x.items) && x.items.some((it) => it && it.name));
    if (list) {
      const options = list.items.filter((it) => it && it.name).map((it) => ({ name: deTag(it.name), description: text(it.entries) }));
      if (options.length >= 2) { out.push({ trait: deTag(e.name), options }); seenTraits.add(e.name); continue; }
    }
    // Patrón 2: tabla (Dragonborn: Dragón → Tipo de daño).
    const table = e.entries.find((x) => x && x.type === "table" && Array.isArray(x.rows));
    if (table) {
      const labels = (table.colLabels ?? []).map(deTag);
      const options = table.rows.map((row) => {
        const cells = (Array.isArray(row) ? row : [row]).map((c) => deTag(typeof c === "string" ? c : (c?.roll ? "" : JSON.stringify(c))));
        return { name: cells[0], description: cells.slice(1).map((c, i) => `${labels[i + 1] ? labels[i + 1] + ": " : ""}${c}`).filter(Boolean).join(", ") };
      }).filter((o) => o.name);
      if (options.length >= 2) { out.push({ trait: deTag(e.name), options }); seenTraits.add(e.name); continue; }
    }
  }
  // Patrón 3: _versions (linajes/legados) solo si aún no capturamos un linaje/legado por lista/tabla.
  if (Array.isArray(r._versions) && r._versions.length >= 2 && !out.some((c) => /lineage|legacy/i.test(c.trait))) {
    const uniq = [...new Set(r._versions.map((v) => {
      const full = v.name || v._abstract?.name || "";
      return full.includes(";") ? full.split(";").slice(1).join(";").trim() : full;
    }).filter(Boolean))];
    const lineageTrait = (r.entries ?? []).find((e) => e?.name && /lineage|legacy/i.test(e.name) && !seenTraits.has(e.name));
    if (uniq.length >= 2 && lineageTrait) {
      out.push({ trait: deTag(lineageTrait.name), options: uniq.map((name) => ({ name, description: "" })) });
    }
  }
  // Efecto mecánico de linaje: velocidad que sobreescribe la base (Wood Elf → 35 ft), leída de _versions.
  if (Array.isArray(r._versions)) {
    for (const ch of out) {
      for (const opt of ch.options) {
        const ver = r._versions.find((v) => String(v.name || v._abstract?.name || "").includes(opt.name));
        if (ver && typeof ver.speed === "number") opt.speed = ver.speed;
      }
    }
  }
  return out.length ? out : undefined;
}

// Descripciones de roleplay de los trasfondos (fluff-backgrounds.json).
function buildBackgroundFluff(dataDir) {
  const map = {};
  const file = path.join(dataDir, "fluff-backgrounds.json");
  if (!fs.existsSync(file)) return map;
  for (const f of readJson(file).backgroundFluff ?? []) {
    if (f.entries) map[`${f.name}|${f.source}`] = text(f.entries);
  }
  return map;
}

// Mapa conjuro(min) → clases 2024 (XPHB), desde spells/sources.json.
function buildSpellClassMap(dataDir) {
  const map = {};
  const file = path.join(dataDir, "spells", "sources.json");
  if (!fs.existsSync(file)) return map;
  const json = readJson(file);
  for (const bySource of Object.values(json)) {
    for (const [spellName, info] of Object.entries(bySource)) {
      const set = (map[spellName.toLowerCase()] ??= new Set());
      for (const cl of info.class ?? []) if (cl.source === "XPHB") set.add(cl.name);
    }
  }
  return map;
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
  const classMap = buildSpellClassMap(DATA_DIR); // conjuro → clases 2024
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith("spells-") || !f.endsWith(".json")) continue;
    const json = readJson(path.join(dir, f));
    for (const sp of json.spell ?? []) {
      if (!SOURCES_2024.has(sp.source)) continue;
      const e = convertSpell(sp);
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      const cls = classMap[sp.name.toLowerCase()];
      if (cls && cls.size) e.data.classes = [...cls].sort();
      entries.push(e);
    }
  }
  entries.sort((a, b) => a.data.level - b.data.level || a.name.localeCompare(b.name));
  writePack("dnd2024-spells", "D&D 2024 — Hechizos", "D&D 2024 (uso privado; © Wizards of the Coast)", entries);
}

// ─── Dotes ───
// Mejora de característica de una dote: fija ({str:1}) y/o a elegir ({choose:{from,count,amount}}).
// Las medias dotes 2024 (Slasher, Sentinel, Piercer…) dan "+1 a X o Y" → abilityChoice.
function parseFeatAbility(ability) {
  if (!Array.isArray(ability)) return {};
  const fixed = {};
  let choice;
  for (const a of ability) {
    if (!a || typeof a !== "object") continue;
    if (a.choose && Array.isArray(a.choose.from)) {
      choice = { from: a.choose.from, count: a.choose.count ?? 1, amount: a.choose.amount ?? 1 };
    } else {
      for (const [k, v] of Object.entries(a)) if (typeof v === "number") fixed[k] = (fixed[k] ?? 0) + v;
    }
  }
  const out = {};
  if (Object.keys(fixed).length) out.abilityBonus = fixed;
  if (choice) out.abilityChoice = choice;
  return out;
}
function convertFeat(ft) {
  return { id: slug(ft.name, "feat"), type: "feat", name: ft.name, data: {
    summary: text(ft.entries),
    category: ft.category,
    prerequisite: renderPrereq(ft.prerequisite),
    ...parseFeatAbility(ft.ability),
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
  const fluff = buildBackgroundFluff(DATA_DIR); // descripciones de roleplay
  for (const bg of readJson(path.join(DATA_DIR, "backgrounds.json")).background ?? []) {
    if (!SOURCES_2024.has(bg.source) || bg._copy) continue;
    const e = convertBackground(bg);
    const desc = fluff[`${bg.name}|${bg.source}`];
    if (desc) e.data.description = desc;
    entries.push(e);
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  writePack("dnd2024-backgrounds", "D&D 2024 — Trasfondos", "D&D 2024 (uso privado; © Wizards of the Coast)", entries);
}

// ─── Especies ───
// Elección de habilidad de la especie (Human Skillful: {any:1} → elige 1 de cualquiera).
function parseRaceSkillChoice(sp) {
  const first = Array.isArray(sp) ? sp[0] : undefined;
  if (!first || typeof first !== "object") return undefined;
  if (first.choose?.from) return { count: first.choose.count ?? 1, from: first.choose.from };
  if (typeof first.any === "number") return { count: first.any, from: ["*"] };
  return undefined;
}
// Dotes que la especie deja elegir (Human Versatile: 1 dote de origen).
function parseRaceFeatChoices(feats) {
  if (!Array.isArray(feats)) return undefined;
  const out = [];
  for (const f of feats) {
    if (f?.anyFromCategory) out.push({ category: (f.anyFromCategory.category ?? ["O"])[0], count: f.anyFromCategory.count ?? 1 });
  }
  return out.length ? out : undefined;
}
function convertRace(r) {
  const speed = typeof r.speed === "number" ? r.speed : (r.speed?.walk ?? 30);
  // Los rasgos ya vienen descritos en las entradas (incluida la visión en la oscuridad y resistencias);
  // no los duplicamos con texto propio en español.
  const traits = (r.entries ?? []).filter((e) => e && e.name).map((e) => `${deTag(e.name)}: ${text(e.entries)}`);
  const skillChoice = parseRaceSkillChoice(r.skillProficiencies);
  const featChoices = parseRaceFeatChoices(r.feats);
  return { id: slug(r.name, "species"), type: "species", name: r.name, data: {
    size: (r.size ?? ["M"]).map((s) => SIZE[s] ?? s).join(" o "),
    speed,
    traits,
    ...(skillChoice ? { skillChoice } : {}),   // habilidad a elegir de la especie (Human)
    ...(featChoices ? { featChoices } : {}),    // dote(s) a elegir de la especie (Human Versatile)
    ...parseAdditionalSpells(r.additionalSpells), // conjuros otorgados (nivel = nivel de personaje)
    ...(extractAncestryChoices(r) ? { ancestryChoices: extractAncestryChoices(r) } : {}), // ascendencias/linajes a elegir
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
    // Categoría de arma (simple/marcial) para validar competencias de clase.
    weaponCategory: itemType === "weapon" && it.weaponCategory ? String(it.weaponCategory).toLowerCase() : undefined,
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
      ...parseAdditionalSpells(sc.additionalSpells), // conjuros de subclase (nivel = nivel de clase)
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

// ─── Clases (progresión por nivel 2024) ───
const CLASS_WEAPON = (w) => {
  if (typeof w !== "string") return null;
  const s = w.toLowerCase();
  if (s === "simple") return "simple";
  if (s === "martial") return "martial";
  if (s.includes("martial")) {
    const light = /light/.test(s), finesse = /finesse/.test(s);
    if (finesse && light) return "martial-finesse-light";
    if (light) return "martial-light";
    if (finesse) return "martial-finesse";
    return "martial";
  }
  return null;
};
// Tabla de espacios de Pacto (Warlock 2024), sparse: el nivel más alto ≤ nivel del Warlock manda.
const WARLOCK_PACT = { "1": { count: 1, level: 1 }, "2": { count: 2, level: 1 }, "3": { count: 2, level: 2 }, "5": { count: 2, level: 3 }, "7": { count: 2, level: 4 }, "9": { count: 2, level: 5 }, "11": { count: 3, level: 5 }, "17": { count: 4, level: 5 } };

function convertClass(f) {
  const sp = f.startingProficiencies || {};
  const skillProf = (sp.skills || [])[0];
  let skillChoices = 0, skillOptions = [];
  if (skillProf?.choose) { skillChoices = skillProf.choose.count ?? 0; skillOptions = skillProf.choose.from ?? []; }
  else if (skillProf?.any) { skillChoices = skillProf.any; skillOptions = ["*"]; } // "elige de cualquiera"
  const keyFeatures = {};
  for (const cf of f.classFeatures || []) {
    const ref = typeof cf === "string" ? cf : cf.classFeature;
    if (!ref) continue;
    const parts = ref.split("|");
    const name = deTag(parts[0]); const level = parts[3] || "1";
    if (name === "Ability Score Improvement") continue; // la mejora/dote se maneja aparte en la subida de nivel
    const label = (typeof cf === "object" && cf.gainSubclassFeature) ? "Subclass" : name;
    (keyFeatures[level] ??= []).push(label);
  }
  return { id: slug(f.name, "class"), type: "class", name: f.name, data: {
    hitDie: f.hd?.faces ?? 8,
    primaryAbility: f.primaryAbility?.[0] ? Object.keys(f.primaryAbility[0]).filter((k) => f.primaryAbility[0][k]) : [],
    saves: f.proficiency || [],
    skillChoices,
    skillOptions,
    armor: sp.armor || [],
    weapons: (sp.weapons || []).map(CLASS_WEAPON).filter(Boolean),
    subclassLevel: 3,
    spellcastingAbility: f.spellcastingAbility ?? null,
    casterType: f.casterProgression ?? undefined,
    keyFeatures,
    ...(f.name.toLowerCase() === "warlock" ? { pactSlots: WARLOCK_PACT } : {}),
    source: f.source,
  } };
}

if (want("classes")) {
  const dir = path.join(DATA_DIR, "class");
  const entries = [];
  const seen = new Set();
  for (const file of fs.readdirSync(dir)) {
    if (!file.startsWith("class-") || !file.endsWith(".json")) continue;
    for (const f of readJson(path.join(dir, file)).class ?? []) {
      if (!SOURCES_2024.has(f.source)) continue;
      const e = convertClass(f);
      if (seen.has(e.id)) continue; seen.add(e.id);
      entries.push(e);
    }
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  writePack("dnd2024-classes", "D&D 2024 — Clases", "D&D 2024 (uso privado; © Wizards of the Coast)", entries);
}

// ─── Bestiario (monstruos con stat block y acciones parseadas) ───
const CR_XP = { "0": 10, "1/8": 25, "1/4": 50, "1/2": 100, "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800, "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900, "11": 7200, "12": 8400, "13": 10000, "14": 11500, "15": 13000, "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000, "21": 33000, "22": 41000, "23": 50000, "24": 62000, "25": 75000, "26": 90000, "27": 105000, "28": 120000, "29": 135000, "30": 155000 };
const crNum = (cr) => (cr === "1/8" ? 0.125 : cr === "1/4" ? 0.25 : cr === "1/2" ? 0.5 : Number(cr) || 0);
const crToPb = (cr) => { const n = crNum(cr); return n <= 4 ? 2 : n <= 8 ? 3 : n <= 12 ? 4 : n <= 16 ? 5 : n <= 20 ? 6 : n <= 24 ? 7 : n <= 28 ? 8 : 9; };
const DMG_TYPE_MON = { acid: "ácido", bludgeoning: "contundente", cold: "frío", fire: "fuego", force: "fuerza", lightning: "relámpago", necrotic: "necrótico", piercing: "perforante", poison: "veneno", psychic: "psíquico", radiant: "radiante", slashing: "cortante", thunder: "trueno" };
const SAVE_ABBR = { strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha" };

function renderSpeed(sp) {
  if (typeof sp === "number") return `${sp} ft`;
  if (!sp) return "—";
  const out = [];
  for (const [k, v] of Object.entries(sp)) {
    if (k === "walk") out.unshift(`${typeof v === "object" ? v.number : v} ft`);
    else if (typeof v === "number" || typeof v === "object") out.push(`${k} ${typeof v === "object" ? v.number : v} ft`);
  }
  return out.join(", ");
}
function numObj(o) { if (!o) return undefined; const r = {}; for (const [k, v] of Object.entries(o)) { const n = Number(String(v).replace(/[^\d-]/g, "")); if (!Number.isNaN(n)) r[k] = n; } return Object.keys(r).length ? r : undefined; }
function immuneStr(v) {
  if (!v) return undefined;
  const parts = [];
  for (const e of Array.isArray(v) ? v : [v]) {
    if (typeof e === "string") parts.push(DMG_TYPE_MON[e] ?? e);
    else if (e && typeof e === "object") { const list = e.immune ?? e.resist ?? e.vulnerable ?? []; parts.push(`${list.map((x) => DMG_TYPE_MON[x] ?? x).join(", ")}${e.note ? ` ${e.note}` : ""}`); }
  }
  return parts.join("; ") || undefined;
}

// Parsea una acción/rasgo: descripción legible + mecánica de ataque/salvación/recarga.
function parseAction(a) {
  const raw = (a.entries ?? []).filter((e) => typeof e === "string").join(" ");
  const rawName = a.name ?? "";
  const description = text(a.entries);
  const out = { name: deTag(rawName), description };
  const rech = rawName.match(/\{@recharge ?(\d?)\}/);
  if (rech) { out.name = deTag(rawName.replace(/\{@recharge ?\d?\}/, "").trim()); out.recharge = rech[1] ? `Recarga ${rech[1]}-6` : "Recarga"; }
  const hit = raw.match(/\{@hit ([+-]?\d+)\}/);
  const dmgMatches = [...raw.matchAll(/\{@(?:damage|dice) ([^}|]+)/g)].map((m) => m[1].trim());
  const atk = raw.match(/\{@atkr? ([^}]+)\}/);
  if (hit) {
    const typeM = raw.match(/\)\s*(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder)/i);
    out.attack = { bonus: Number(hit[1]), damage: dmgMatches[0] || undefined, damageType: typeM ? (DMG_TYPE_MON[typeM[1].toLowerCase()] ?? typeM[1]) : undefined, ranged: !!atk && /r/i.test(atk[1]) };
    if (dmgMatches[1]) out.attack.extraDamage = dmgMatches[1];
  }
  const dc = raw.match(/\{@dc (\d+)\}/);
  if (dc) {
    const sv = raw.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i);
    out.save = { dc: Number(dc[1]), ability: sv ? SAVE_ABBR[sv[1].toLowerCase()] : undefined };
    if (!out.attack && dmgMatches[0]) { out.save.damage = dmgMatches[0]; const t = raw.match(/(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder)/i); if (t) out.save.damageType = DMG_TYPE_MON[t[1].toLowerCase()] ?? t[1]; }
  }
  return out;
}

function convertMonster(m) {
  const ac = Array.isArray(m.ac) ? (typeof m.ac[0] === "object" ? m.ac[0].ac : m.ac[0]) : m.ac;
  const acFrom = Array.isArray(m.ac) && typeof m.ac[0] === "object" && m.ac[0].from ? m.ac[0].from.map((x) => deTag(x)).join(", ") : undefined;
  const type = typeof m.type === "string" ? m.type : (m.type?.type ? (typeof m.type.type === "string" ? m.type.type : deTag(JSON.stringify(m.type.type))) : "—");
  const cr = typeof m.cr === "object" ? (m.cr.cr ?? "0") : (m.cr ?? "0");
  const mapActs = (arr) => (arr ?? []).map(parseAction);
  return { id: slug(m.name, "monster"), type: "monster", name: m.name, data: {
    size: (Array.isArray(m.size) ? m.size : [m.size]).map((s) => SIZE[s] ?? s).join("/"),
    creatureType: type,
    ac, acFrom,
    hp: m.hp ? { average: m.hp.average, formula: m.hp.formula } : undefined,
    speed: renderSpeed(m.speed),
    abilities: { str: m.str, dex: m.dex, con: m.con, int: m.int, wis: m.wis, cha: m.cha },
    saves: numObj(m.save), skills: numObj(m.skill),
    senses: (m.senses ?? []).map(deTag).join(", ") || undefined, passivePerception: m.passive,
    languages: (m.languages ?? []).map(deTag).join(", ") || undefined,
    cr, xp: CR_XP[cr], pb: crToPb(cr),
    resist: immuneStr(m.resist), immune: immuneStr(m.immune), vulnerable: immuneStr(m.vulnerable),
    conditionImmune: (m.conditionImmune ?? []).map((x) => (typeof x === "string" ? x : "")).filter(Boolean).join(", ") || undefined,
    traits: mapActs(m.trait), actions: mapActs(m.action), bonusActions: mapActs(m.bonus), reactions: mapActs(m.reaction),
    legendary: mapActs(m.legendary),
    source: m.source,
  } };
}

if (want("monsters")) {
  const dir = path.join(DATA_DIR, "bestiary");
  const entries = [];
  const seen = new Set();
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith("bestiary-") || !f.endsWith(".json")) continue;
    for (const m of readJson(path.join(dir, f)).monster ?? []) {
      if (!SOURCES_2024.has(m.source) || m._copy || m.isNpc) continue;
      const e = convertMonster(m);
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      entries.push(e);
    }
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  writePack("dnd2024-monsters", "D&D 2024 — Bestiario", "D&D 2024 (uso privado; © Wizards of the Coast)", entries);
}
