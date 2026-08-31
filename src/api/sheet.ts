// Hoja calculada para la API: computedSheet base + valores finales con modificadores activos,
// más desgloses de cálculo (de dónde sale cada número), armas equipadas y trucos (para tirar desde la hoja).
import { ABILITIES, SKILLS, computedSheet, saveBonus, skillBonus, totalLevel } from "../rules.js";
import { effectiveFeatureMax } from "../domain/combat.js";
import { weaponMasteryView } from "../domain/masteries.js";
import { wildShapeState } from "../domain/wildshape.js";
import { computeActiveModifiers } from "../domain/modifiers.js";
import { armorPenalty, isProficientWithItem } from "../domain/proficiency.js";
import { scaleCantripDamage, spellMechanics } from "../domain/spells.js";
import { recalcSlots } from "../domain/characters.js";
import { allEntries, findEntry } from "../domain/content.js";
import type { Character } from "../types.js";

export function characterSheet(c: Character): Record<string, unknown> {
  // Auto-repara la capacidad y los slots de conjuro desde el contenido (subclases lanzadoras, Paladín/Explorador
  // 2024 con slot desde nivel 1…). Idempotente: en lecturas no persiste; en escrituras se guarda al hacer saveDb.
  recalcSlots(c);
  const base = computedSheet(c) as Record<string, unknown>;
  const mods = computeActiveModifiers(c);

  // Resuelve la descripción de un rasgo desde el contenido (para rasgos de clase que solo guardan el nombre).
  const pool = allEntries().filter((e) => typeof e.data["summary"] === "string");
  const describe = (name: string, source: string): string | null => {
    const cls = source.split(" nivel ")[0].trim().toLowerCase();
    const named = pool.filter((e) => e.name.toLowerCase() === name.toLowerCase());
    const best = named.find((e) => e.type === "classfeature" && String(e.data["class"] ?? "").toLowerCase() === cls)
      ?? named.find((e) => e.type === "classfeature") ?? named[0];
    return (best?.data["summary"] as string | undefined) ?? null;
  };

  const skillDetails = Object.fromEntries(Object.keys(SKILLS).map((s) => [s, skillBonus(c, s).detail]));
  const saveDetails = Object.fromEntries(ABILITIES.map((a) => {
    const d = saveBonus(c, a).detail;
    const flat = mods.saveFlat[a];
    return [a, flat ? `${d} + extra(${flat >= 0 ? "+" : ""}${flat})` : d];
  }));
  // Salvaciones numéricas con los bonos de objetos/rasgos (Ring of Protection, Exhaustion…).
  const saves = Object.fromEntries(ABILITIES.map((a) => [a, (base["saves"] as Record<string, number>)[a] + mods.saveFlat[a]]));
  // Ataque/CD de conjuro con los bonos de objetos (Staff of Power +2, etc.).
  const baseSpell = base["spellcasting"] as { dc: number; attack: number } | null;
  const spellcasting = baseSpell
    ? { ...baseSpell, attack: baseSpell.attack + mods.spellAttackFlat, dc: baseSpell.dc + mods.spellDcFlat }
    : baseSpell;

  const weapons = c.inventory
    .filter((i) => i.type === "weapon")
    .map((i) => ({ id: i.id, name: i.name, damage: i.damage ?? null, equipped: i.equipped, proficient: isProficientWithItem(c, i) }));

  // Aviso de equipo sin competencia (armadura/escudo equipado): penalización 2024.
  const armor = armorPenalty(c);

  // Trucos con su daño escalado al nivel (para tirar daño desde la hoja, como las armas).
  const cantrips = c.spellcasting.known
    .filter((s) => s.level === 0)
    .map((s) => {
      const cd = (findEntry(s.name, "spell")?.data ?? {}) as Record<string, unknown>;
      const mech = spellMechanics(cd);
      return {
        name: s.name,
        damage: mech.damage ? scaleCantripDamage(mech.damage, totalLevel(c)) : null,
        damageType: mech.damageType ?? null,
        attack: mech.attack ?? false,
      };
    });

  // Clase cuya LISTA de conjuros usa cada clase del personaje: la propia si lanza, o la de una subclase
  // lanzadora (Embaucador Arcano/Caballero Arcano → Mago). Sirve para filtrar "solo mi clase" en el grimorio.
  const spellListFor = (cl: { name: string; subclass?: string | null }): string | null => {
    if (findEntry(cl.name, "class")?.data["spellcastingAbility"]) return cl.name;
    const sd = cl.subclass ? findEntry(cl.subclass, "subclass")?.data : undefined;
    if (sd?.["spellcastingAbility"]) return (sd["spellListClass"] as string | undefined) ?? cl.name;
    return null;
  };
  const classList = c.classes.map((cl) => ({ name: cl.name, subclass: cl.subclass ?? null, level: cl.level, spellList: spellListFor(cl) }));
  const features = c.features.map((f) => ({
    name: f.name, source: f.source, description: f.description ?? describe(f.name, f.source),
    uses: f.uses ? { used: f.uses.used, max: effectiveFeatureMax(c, f), recharge: f.uses.recharge } : undefined,
  }));

  // Rasgos raciales de la especie (del contenido) para la sección de información.
  const speciesData = findEntry(c.species, "species")?.data as Record<string, unknown> | undefined;
  const speciesTraits = (speciesData?.["traits"] as string[] | undefined) ?? [];
  const size = (speciesData?.["size"] as string | undefined) ?? null;
  // Resistencias: las del personaje (afinidad dracónica…) + las raciales (Resistencia Enana → Veneno)
  // + las de objetos equipados o sintonizados.
  const speciesResistances = (speciesData?.["resistances"] as string[] | undefined) ?? [];
  const itemResistances = c.inventory
    .filter((i) => i.equipped || i.attuned)
    .flatMap((i) => (i.resistances ?? (findEntry(i.name, "item")?.data["resistances"] as string[] | undefined)) ?? []);
  const resistances = [...new Set([...(c.resistances ?? []), ...speciesResistances, ...itemResistances, ...mods.resistances])];

  // Descripción del trasfondo (para roleplay).
  const backgroundDescription = (findEntry(c.background, "background")?.data["description"] as string | undefined) ?? null;
  // Diario ordenado por fecha descendente (lo más reciente primero).
  const journal = [...(c.journal ?? [])].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1)));

  return {
    ...base,
    ac: mods.ac.final,
    acBase: mods.ac.base,
    speed: mods.speed.final,
    speedBase: mods.speed.base,
    initiative: (base["initiative"] as number) + mods.initiativeFlat,
    saves,
    spellcasting,
    critRange: mods.critRange,
    skillDetails,
    saveDetails,
    weapons,
    armorNotProficient: armor.active,
    equipmentWarning: armor.warning,
    cantrips,
    classList,
    features,
    speciesTraits,
    size,
    armorProficiencies: c.proficiencies.armor,
    weaponProficiencies: c.proficiencies.weapons,
    backgroundDescription,
    resistances,
    weaponMastery: weaponMasteryView(c),
    wildShape: wildShapeState(c),
    languages: c.proficiencies.languages,
    tools: c.proficiencies.tools,
    skillProficiencies: c.proficiencies.skills, // habilidades con competencia (para elegir pericia)
    expertise: c.proficiencies.expertise,       // habilidades con pericia (doble competencia)
    personality: c.personality ?? {},
    journal,
    appearance: c.appearance ?? null,
    backstory: c.backstory ?? null,
    notes: c.notes ?? null,
    alignment: c.alignment ?? null,
    acOverride: c.acOverride ?? null,       // CA fija manual (null = automática)
    initiativeBonusManual: c.initiativeBonus ?? 0, // bono de iniciativa manual
    xp: c.xp ?? 0,
    modifiers: mods,
  };
}
