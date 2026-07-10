// ─── Tipos del dominio D&D 5e (reglas 2024 / SRD 5.2) ───

export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

export interface Abilities {
  str: number; dex: number; con: number; int: number; wis: number; cha: number;
}

export interface ClassLevel {
  name: string;          // p.ej. "Wizard"
  subclass?: string;     // p.ej. "Evoker"
  level: number;
  hitDie: number;        // 6, 8, 10, 12
}

export interface FeatureUses {
  max: number;
  used: number;
  recharge: "short_rest" | "long_rest" | "dawn" | "manual";
}

export interface Feature {
  name: string;
  source: string;        // "Wizard 2", "Species: Elf", "Feat: Alert", "Background"
  description?: string;
  uses?: FeatureUses;
}

export type ItemType =
  | "weapon" | "armor" | "shield" | "tool" | "gear" | "consumable"
  | "wondrous" | "ammunition" | "container" | "treasure" | "other";

export interface InventoryItem {
  id: string;
  name: string;
  type: ItemType;
  quantity: number;
  weight?: number;             // por unidad, en libras
  equipped: boolean;
  requiresAttunement: boolean;
  attuned: boolean;
  description?: string;
  // Propiedades mecánicas opcionales
  armorClass?: number;         // CA base para armaduras / bono para escudos
  armorCategory?: "light" | "medium" | "heavy" | "shield";
  damage?: string;             // "1d8 slashing"
  properties?: string[];       // ["finesse", "light", ...]
  magicBonus?: number;         // +1, +2, +3
  containerId?: string | null; // si está dentro de otro objeto (mochila, bolsa)
}

export interface Currency { pp: number; gp: number; ep: number; sp: number; cp: number; }

export interface KnownSpell {
  name: string;
  level: number;               // 0 = truco
  prepared: boolean;
  alwaysPrepared: boolean;     // dominio, especie, dotes...
  source: string;              // "Wizard", "Feat: Magic Initiate"
  ritual?: boolean;
  concentration?: boolean;
  notes?: string;
}

export interface SpellSlots {
  [level: string]: { max: number; used: number };  // "1".."9"
}

export interface Spellcasting {
  ability?: AbilityKey;
  slots: SpellSlots;
  pactSlots?: { level: number; max: number; used: number };
  known: KnownSpell[];
  concentratingOn?: string | null;
}

// ─── Modificadores activos (estados/conjuros que afectan valores derivados) ───

export type ModifierTarget =
  | "ac" | "speed" | "save" | "check" | "attack" | "initiative" | "damage" | "hp_max";

export type ModifierOp =
  | "add" | "set" | "multiply" | "min"
  | "advantage" | "disadvantage" | "autofail"
  | "immune" | "resist" | "vulnerable";

export interface StatModifier {
  target: ModifierTarget;
  op: ModifierOp;
  value?: number | string;     // número (fijo) o notación de dados ("1d4", de tirada)
  ability?: AbilityKey;        // alcance para save/check
  skill?: string;              // alcance para check
  note?: string;
}

export interface ActiveCondition {
  name: string;                // Blinded, Charmed, Exhaustion...
  level?: number;              // para Exhaustion (1-6)
  source?: string;
  note?: string;
  mechanics?: StatModifier[];  // opcional: sobreescribe las mecánicas por defecto (homebrew)
}

export interface ActiveEffect {
  id: string;
  name: string;                // "Bless", "Haste", "Veneno de araña"
  description?: string;
  roundsRemaining?: number | null;  // null = sin límite / hasta descanso
  minutesRemaining?: number | null;
  concentration: boolean;
  concentrator?: string;       // quién concentra (puede ser otro PJ/PNJ)
  source?: string;
  appliesTo: "self" | "companion";
  companionId?: string;
  mechanics?: StatModifier[];  // modificadores mecánicos del efecto (buff/debuff)
}

export interface Companion {
  id: string;
  name: string;
  kind: "companion" | "pet" | "familiar" | "mount" | "summon" | "sidekick";
  species?: string;            // "Wolf", "Owl", "Steel Defender"
  abilities?: Partial<Abilities>;
  ac?: number;
  hp: { max: number; current: number; temp: number };
  speed?: string;
  attacks?: { name: string; bonus: number; damage: string }[];
  conditions: ActiveCondition[];
  notes?: string;
  art?: string;
}

export interface SheetStyle {
  theme: string;               // "classic" | "dark" | "parchment" | "arcane" | custom
  accentColor?: string;
  fontFamily?: string;
  artUrl?: string;
  artPrompt?: string;          // descripción del retrato para generarlo
  layout?: "classic" | "compact" | "spellcaster" | "landscape";
  showPortrait?: boolean;
  customCss?: string;
  tokens?: Record<string, string>;
}

export interface DeathSaves { successes: number; failures: number; }

export interface Character {
  id: string;
  name: string;
  playerName?: string;
  species: string;
  background: string;
  alignment?: string;
  classes: ClassLevel[];
  abilities: Abilities;
  hp: { max: number; current: number; temp: number };
  hitDice: { die: number; total: number; used: number }[];
  deathSaves: DeathSaves;
  speed: number;
  size?: string;
  acOverride?: number | null;
  initiativeBonus: number;     // bonos extra además de DES
  proficiencies: {
    saves: AbilityKey[];
    skills: string[];
    expertise: string[];
    tools: string[];
    languages: string[];
    weapons: string[];
    armor: string[];
  };
  features: Feature[];
  inventory: InventoryItem[];
  currency: Currency;
  spellcasting: Spellcasting;
  conditions: ActiveCondition[];
  effects: ActiveEffect[];
  companions: Companion[];
  style: SheetStyle;
  inspiration: boolean;        // Heroic Inspiration
  appearance?: string;
  backstory?: string;
  notes?: string;
  personality?: Personality;
  journal?: JournalEntry[];
  xp?: number;
  createdAt: string;
  updatedAt: string;
}

/** Rasgos de rol (PHB 2024): personalidad, ideales, vínculos y defectos. */
export interface Personality {
  traits?: string;
  ideals?: string;
  bonds?: string;
  flaws?: string;
}

/** Entrada del diario de campaña/sesión, fechada, para trackear la historia del personaje. */
export interface JournalEntry {
  id: string;
  date: string;        // fecha de la sesión (YYYY-MM-DD)
  title?: string;
  campaign?: string;
  body: string;
  createdAt: string;
}

// ─── Content packs ───

export type ContentType =
  | "class" | "subclass" | "species" | "background" | "feat"
  | "spell" | "item" | "condition" | "monster" | "rule";

export interface ContentEntry {
  id: string;                  // slug único: "spell:fireball"
  type: ContentType;
  name: string;
  data: Record<string, unknown>;
}

export interface ContentPack {
  id: string;
  name: string;
  version: string;
  source: string;              // "SRD 5.2 (CC-BY-4.0)", "Homebrew", ...
  description?: string;
  entries: ContentEntry[];
}

// ─── Almacenamiento ───

export interface Database {
  characters: Character[];
}
