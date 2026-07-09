// Dominio de personalización de hoja (SheetStyle). La UI lee estos campos para renderizar.
// Solo cambia los campos incluidos.

import type { Character, SheetStyle } from "../types.js";

export interface StyleInput {
  theme?: string;
  accentColor?: string;
  fontFamily?: string;
  artUrl?: string;
  artPrompt?: string;
  layout?: "classic" | "compact" | "spellcaster" | "landscape";
  showPortrait?: boolean;
  customCss?: string;
  tokens?: Record<string, string>;
}

export function customizeStyle(c: Character, input: StyleInput): SheetStyle {
  const s = c.style;
  if (input.theme !== undefined) s.theme = input.theme;
  if (input.accentColor !== undefined) s.accentColor = input.accentColor;
  if (input.fontFamily !== undefined) s.fontFamily = input.fontFamily;
  if (input.artUrl !== undefined) s.artUrl = input.artUrl;
  if (input.artPrompt !== undefined) s.artPrompt = input.artPrompt;
  if (input.layout !== undefined) s.layout = input.layout;
  if (input.showPortrait !== undefined) s.showPortrait = input.showPortrait;
  if (input.customCss !== undefined) s.customCss = input.customCss;
  if (input.tokens) s.tokens = { ...s.tokens, ...input.tokens };
  return s;
}
