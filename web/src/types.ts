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
  level?: number; abilities: Record<AbilityKey, number>; skills?: string[];
}

export interface SheetStyle {
  theme?: string; accentColor?: string; fontFamily?: string;
  layout?: string; showPortrait?: boolean; artUrl?: string;
  customCss?: string; tokens?: Record<string, string>;
}

export interface RollLine { mode: "normal" | "advantage" | "disadvantage"; bonuses: string[]; }

export interface Modifiers {
  ac: { base: number; final: number; sources: string[] };
  speed: { base: number; final: number; sources: string[] };
  attack: RollLine;
  check: RollLine;
  initiative: RollLine;
  saves: Record<AbilityKey, RollLine & { autofail: boolean }>;
  incapacitated: boolean;
  active: string[];
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
  weapons: { id: string; name: string; damage: string | null; equipped: boolean }[];
  cantrips: { name: string }[];
  classList: { name: string; subclass: string | null; level: number }[];
  features: { name: string; source: string; description: string | null }[];
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
