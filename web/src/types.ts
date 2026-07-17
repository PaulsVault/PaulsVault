// Tipos de las respuestas de la API (espejo de lo que devuelve el dominio).
export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";
export const ABILITIES: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];
export const ABILITY_LABEL: Record<AbilityKey, string> = {
  str: "FUE", dex: "DES", con: "CON", int: "INT", wis: "SAB", cha: "CAR",
};

export interface CharacterSummary {
  id: string; name: string; classes: string; level: number; species: string; hp: string;
}

export interface ContentHit {
  id: string; type: string; name: string; pack: string; preview?: string;
}

export interface CreateInput {
  name: string; className: string; species: string; background: string;
  level?: number; abilities: Record<AbilityKey, number>;
  abilityBonuses?: Partial<Record<AbilityKey, number>>; skills?: string[]; tools?: string[];
  backgroundSkills?: string[]; originFeat?: string; // trasfondo personalizado
  featAbilities?: Partial<Record<AbilityKey, number>>; // media dote de origen elegida
  ancestryChoices?: Record<string, string>;         // ascendencia/linaje elegido por rasgo
  speciesSkills?: string[];                          // habilidad(es) elegidas de la especie (Human Skillful)
  speciesFeats?: { name: string; abilities?: Partial<Record<AbilityKey, number>> }[]; // dote(s) de especie (Versatile)
  languages?: string[]; alignment?: string;
  options?: string[];                                // elecciones de clase de nivel 1 (estilo de combate…)
}

export interface WildShapeState {
  druidLevel: number; maxUses: number; used: number;
  maxCRNum: number; maxCRLabel: string; knownForms: number; fly: boolean; hours: number;
}
export interface BeastForm { name: string; cr: string; crNum: number; size: string; ac: number; hp: number; speed: string; fly: boolean; swim: boolean }

export interface SheetStyle {
  theme?: string; accentColor?: string; fontFamily?: string;
  layout?: string; showPortrait?: boolean; artUrl?: string;
  customCss?: string; tokens?: Record<string, string>;
}

export interface RollLine { mode: "normal" | "advantage" | "disadvantage"; bonuses: string[]; }

export interface Personality { traits?: string; ideals?: string; bonds?: string; flaws?: string; }

export interface JournalEntry {
  id: string; date: string; title?: string; campaign?: string; body: string; createdAt: string;
}

export interface Modifiers {
  ac: { base: number; final: number; sources: string[] };
  speed: { base: number; final: number; sources: string[] };
  attack: RollLine;
  check: RollLine;
  initiative: RollLine;
  saves: Record<AbilityKey, RollLine & { autofail: boolean }>;
  incapacitated: boolean;
  active: string[];
  critRange: number;
  initiativeFlat: number;
  saveFlat: Record<AbilityKey, number>;
  spellAttackFlat: number;
  spellDcFlat: number;
}

export interface Sheet {
  id: string; name: string; level: number; classes: string; species: string; background: string;
  proficiencyBonus: number;
  abilities: Record<AbilityKey, { score: number; mod: number }>;
  ac: number; acBase: number; acFormula: string;
  initiative: number; speed: number; speedBase: number;
  hp: { max: number; current: number; temp: number };
  passivePerception: number;
  saves: Record<AbilityKey, number>;
  skills: Record<string, number>;
  skillDetails: Record<string, string>;
  saveDetails: Record<AbilityKey, string>;
  weapons: { id: string; name: string; damage: string | null; equipped: boolean; proficient?: boolean }[];
  armorNotProficient?: boolean;
  equipmentWarning?: string | null;
  cantrips: { name: string; damage?: string | null; damageType?: string | null; attack?: boolean }[];
  classList: { name: string; subclass: string | null; level: number }[];
  features: { name: string; source: string; description: string | null; uses?: { used: number; max: number; recharge: string } | null }[];
  speciesTraits: string[];
  resistances?: string[];
  weaponMastery?: { max: number; chosen: { weapon: string; mastery: string; description: string | null }[] };
  wildShape?: WildShapeState | null;
  backgroundDescription?: string | null;
  languages?: string[];
  tools?: string[];
  critRange: number;
  personality: Personality;
  journal: JournalEntry[];
  appearance: string | null;
  backstory: string | null;
  notes: string | null;
  alignment: string | null;
  spellcasting: null | {
    dc: number; attack: number; ability: string;
    slots: Record<string, { max: number; used: number }>;
    pactSlots?: { level: number; max: number; used: number } | null;
    concentratingOn?: string | null;
  };
  conditions: { name: string; level?: number }[];
  effects: { id: string; name: string; roundsRemaining?: number | null; concentration: boolean }[];
  inspiration: boolean;
  currency: Record<string, number>;
  style: SheetStyle;
  modifiers: Modifiers;
}
