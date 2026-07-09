import type { CharacterSummary, ContentHit, CreateInput, Sheet } from "./types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch("/api" + path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data as { error?: { message?: string } })?.error?.message ?? `Error ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

const enc = encodeURIComponent;
type Dict = Record<string, unknown>;

export const api = {
  // Personajes
  listCharacters: () => req<CharacterSummary[]>("/characters"),
  createCharacter: (input: CreateInput) => req<Sheet>("/characters", { method: "POST", body: JSON.stringify(input) }),
  getSheet: (id: string) => req<Sheet>(`/characters/${enc(id)}`),
  updateCharacter: (id: string, set: Dict) => req<Sheet>(`/characters/${enc(id)}`, { method: "PATCH", body: JSON.stringify(set) }),
  deleteCharacter: (id: string) => req<unknown>(`/characters/${enc(id)}?confirm=true`, { method: "DELETE" }),
  levelUp: (id: string, body: Dict) => req<Dict>(`/characters/${enc(id)}/level-up`, { method: "POST", body: JSON.stringify(body) }),

  // Contenido
  content: (type: string, query = "") => req<{ results: ContentHit[] }>(`/content?type=${type}&limit=500${query ? `&query=${enc(query)}` : ""}`).then((r) => r.results),
  spells: (opts: { query?: string; spellClass?: string; spellLevel?: number } = {}) =>
    req<{ results: ContentHit[] }>(`/content?type=spell&limit=500${opts.query ? `&query=${enc(opts.query)}` : ""}${opts.spellClass ? `&spellClass=${enc(opts.spellClass)}` : ""}${opts.spellLevel !== undefined ? `&spellLevel=${opts.spellLevel}` : ""}`).then((r) => r.results),

  // Combate
  hp: (id: string, body: Dict) => req<Dict>(`/characters/${enc(id)}/hp`, { method: "POST", body: JSON.stringify(body) }),
  conditions: (id: string, body: Dict) => req<Dict>(`/characters/${enc(id)}/conditions`, { method: "POST", body: JSON.stringify(body) }),
  effects: (id: string, body: Dict) => req<Dict>(`/characters/${enc(id)}/effects`, { method: "POST", body: JSON.stringify(body) }),
  rest: (id: string, body: Dict) => req<Dict>(`/characters/${enc(id)}/rest`, { method: "POST", body: JSON.stringify(body) }),

  // Hechizos
  getSpells: (id: string) => req<Dict>(`/characters/${enc(id)}/spells`),
  learnSpell: (id: string, body: Dict) => req<Dict>(`/characters/${enc(id)}/spells`, { method: "POST", body: JSON.stringify(body) }),
  forgetSpell: (id: string, name: string) => req<Dict>(`/characters/${enc(id)}/spells/${enc(name)}`, { method: "DELETE" }),
  prepareSpell: (id: string, spell: string, prepare: boolean) => req<Dict>(`/characters/${enc(id)}/spells/${prepare ? "prepare" : "unprepare"}`, { method: "POST", body: JSON.stringify({ spell }) }),
  castSpell: (id: string, body: Dict) => req<Dict>(`/characters/${enc(id)}/spells/cast`, { method: "POST", body: JSON.stringify(body) }),
  slots: (id: string, body: Dict) => req<Dict>(`/characters/${enc(id)}/spell-slots`, { method: "PATCH", body: JSON.stringify(body) }),

  // Inventario
  getInventory: (id: string) => req<Dict>(`/characters/${enc(id)}/inventory`),
  addItem: (id: string, body: Dict) => req<Dict>(`/characters/${enc(id)}/inventory`, { method: "POST", body: JSON.stringify(body) }),
  removeItem: (id: string, itemId: string) => req<Dict>(`/characters/${enc(id)}/inventory/${enc(itemId)}`, { method: "DELETE" }),
  itemAction: (id: string, itemId: string, action: string) => req<Dict>(`/characters/${enc(id)}/inventory/${enc(itemId)}/${action}`, { method: "POST" }),
  currency: (id: string, delta: Dict) => req<Dict>(`/characters/${enc(id)}/currency`, { method: "PATCH", body: JSON.stringify(delta) }),

  // Compañeros
  getCompanions: (id: string) => req<{ companions: Dict[] }>(`/characters/${enc(id)}/companions`),
  createCompanion: (id: string, body: Dict) => req<Dict>(`/characters/${enc(id)}/companions`, { method: "POST", body: JSON.stringify(body) }),
  deleteCompanion: (id: string, cid: string) => req<Dict>(`/characters/${enc(id)}/companions/${enc(cid)}`, { method: "DELETE" }),
  companionHp: (id: string, cid: string, action: "damage" | "heal", amount: number) => req<Dict>(`/characters/${enc(id)}/companions/${enc(cid)}/${action}`, { method: "POST", body: JSON.stringify({ amount }) }),

  // Dados y pruebas
  roll: (expression: string, advantage = "normal", times = 1) =>
    req<{ rolls: { total: number; breakdown: string; crit: string | null }[] }>("/roll", { method: "POST", body: JSON.stringify({ expression, advantage, times }) }),
  check: (id: string, body: Dict) => req<Dict>(`/characters/${enc(id)}/check`, { method: "POST", body: JSON.stringify(body) }),

  // Estilo
  style: (id: string, body: Dict) => req<Dict>(`/characters/${enc(id)}/style`, { method: "PATCH", body: JSON.stringify(body) }),

  // Exportar / importar / entrega .dndchar
  exportCharacter: (id: string, format: "json" | "markdown") => req<Dict>(`/characters/${enc(id)}/export?format=${format}`),
  importCharacter: (character: unknown) => req<Sheet>("/characters/import", { method: "POST", body: JSON.stringify({ character }) }),
  packageCharacter: (id: string) => req<Dict>(`/characters/${enc(id)}/package`, { method: "POST", body: "{}" }),
  importPackage: (pkg: unknown) => req<Dict>("/characters/import-package", { method: "POST", body: JSON.stringify(pkg) }),
  exportBatch: (ids: string[]) => req<Dict>("/characters/export-batch", { method: "POST", body: JSON.stringify({ ids }) }),

  // Contenido y content packs
  searchContent: (params: { query?: string; type?: string; limit?: number }) =>
    req<{ total: number; count: number; results: ContentHit[] }>(`/content?limit=${params.limit ?? 40}${params.type ? `&type=${params.type}` : ""}${params.query ? `&query=${enc(params.query)}` : ""}`),
  getEntry: (idOrName: string) => req<{ id: string; type: string; name: string; pack: string; data: Dict }>(`/content/${enc(idOrName)}`),
  listPacks: () => req<{ id: string; name: string; version: string; source: string; entryCounts: Record<string, number> }[]>("/content-packs"),
  importPack: (pack: unknown) => req<Dict>("/content-packs", { method: "POST", body: JSON.stringify(pack) }),
  deletePack: (packId: string) => req<Dict>(`/content-packs/${enc(packId)}`, { method: "DELETE" }),
};

