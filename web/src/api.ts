import type { CharacterSummary, ContentHit, CreateInput, Sheet } from "./types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch("/api" + path, {
    ...init,
    credentials: "include",
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

export interface AuthUser { id: string; email: string; }
export interface Invite { id: string; token: string; label: string | null; url: string; used: boolean; usedAt: string | null; expiresAt: string | null; createdAt: string; }
export interface ChoiceOption { name: string; summary?: string; prerequisite?: string; }
export interface SpellCard { name: string; level: number; school: string; classes: string[]; summary: string; ritual: boolean; concentration: boolean; }
export interface LevelChoice { kind: string; label: string; count: number; note?: string; options: ChoiceOption[]; }

export const api = {
  // Autenticación
  me: () => req<{ user: AuthUser; isAdmin: boolean }>("/auth/me"),
  register: (email: string, password: string, invite?: string) => req<{ user: AuthUser }>("/auth/register", { method: "POST", body: JSON.stringify({ email, password, invite }) }),
  login: (email: string, password: string) => req<{ user: AuthUser }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => req<{ ok: boolean }>("/auth/logout", { method: "POST" }),

  // Administración: invitaciones (solo admin)
  listInvites: () => req<{ invites: Invite[] }>("/admin/invites").then((r) => r.invites),
  createInvite: (body: { label?: string; expiresInDays?: number }) => req<Invite>("/admin/invites", { method: "POST", body: JSON.stringify(body) }),
  deleteInvite: (id: string) => req<{ ok: boolean }>(`/admin/invites/${enc(id)}`, { method: "DELETE" }),

  // Personajes
  listCharacters: () => req<CharacterSummary[]>("/characters"),
  createCharacter: (input: CreateInput) => req<Sheet>("/characters", { method: "POST", body: JSON.stringify(input) }),
  getSheet: (id: string) => req<Sheet>(`/characters/${enc(id)}`),
  updateCharacter: (id: string, set: Dict) => req<Sheet>(`/characters/${enc(id)}`, { method: "PATCH", body: JSON.stringify(set) }),
  deleteCharacter: (id: string) => req<unknown>(`/characters/${enc(id)}?confirm=true`, { method: "DELETE" }),
  levelUp: (id: string, body: Dict) => req<Dict>(`/characters/${enc(id)}/level-up`, { method: "POST", body: JSON.stringify(body) }),
  levelDown: (id: string, body: Dict = {}) => req<Dict>(`/characters/${enc(id)}/level-down`, { method: "POST", body: JSON.stringify(body) }),
  multiclass: (className: string) => req<{ armor?: string[]; weapons?: string[]; tools?: string[]; skillCount?: number; skillOptions?: string[] }>(`/multiclass/${enc(className)}`),
  classChoices: (className: string, level: number) => req<{ choices: LevelChoice[] }>(`/class-choices/${enc(className)}/${level}`).then((r) => r.choices),

  // Diario de campaña/sesión
  addJournal: (id: string, body: Dict) => req<Sheet>(`/characters/${enc(id)}/journal`, { method: "POST", body: JSON.stringify(body) }),
  updateJournal: (id: string, entryId: string, body: Dict) => req<Sheet>(`/characters/${enc(id)}/journal/${enc(entryId)}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteJournal: (id: string, entryId: string) => req<Sheet>(`/characters/${enc(id)}/journal/${enc(entryId)}`, { method: "DELETE" }),

  // Contenido
  content: (type: string, query = "") => req<{ results: ContentHit[] }>(`/content?type=${type}&limit=500${query ? `&query=${enc(query)}` : ""}`).then((r) => r.results),
  subclassesFor: (className: string) => req<{ results: ContentHit[] }>(`/content?type=subclass&limit=500&subclassOf=${enc(className)}`).then((r) => r.results),
  originFeats: () => req<{ results: ContentHit[] }>("/content?type=feat&featCategory=O&limit=500").then((r) => r.results),
  spellCatalog: (spellClass?: string) => req<{ spells: SpellCard[] }>(`/spells-catalog${spellClass ? `?class=${enc(spellClass)}` : ""}`).then((r) => r.spells),
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
  useCharges: (id: string, itemId: string, amount = 1) => req<Dict>(`/characters/${enc(id)}/inventory/${enc(itemId)}/use-charges`, { method: "POST", body: JSON.stringify({ amount }) }),
  restoreCharges: (id: string, itemId: string, amount?: number) => req<Dict>(`/characters/${enc(id)}/inventory/${enc(itemId)}/restore-charges`, { method: "POST", body: JSON.stringify({ amount }) }),
  castFromItem: (id: string, itemId: string, spell: string) => req<Dict>(`/characters/${enc(id)}/inventory/${enc(itemId)}/cast`, { method: "POST", body: JSON.stringify({ spell }) }),
  useItem: (id: string, itemId: string) => req<Dict>(`/characters/${enc(id)}/inventory/${enc(itemId)}/use`, { method: "POST", body: "{}" }),
  currency: (id: string, delta: Dict) => req<Dict>(`/characters/${enc(id)}/currency`, { method: "PATCH", body: JSON.stringify(delta) }),

  // Compañeros
  getCompanions: (id: string) => req<{ companions: Dict[] }>(`/characters/${enc(id)}/companions`),
  createCompanion: (id: string, body: Dict) => req<Dict>(`/characters/${enc(id)}/companions`, { method: "POST", body: JSON.stringify(body) }),
  deleteCompanion: (id: string, cid: string) => req<Dict>(`/characters/${enc(id)}/companions/${enc(cid)}`, { method: "DELETE" }),
  companionHp: (id: string, cid: string, action: "damage" | "heal", amount: number) => req<Dict>(`/characters/${enc(id)}/companions/${enc(cid)}/${action}`, { method: "POST", body: JSON.stringify({ amount }) }),

  // Dados y pruebas
  roll: (expression: string, advantage = "normal", times = 1) =>
    req<{ rolls: { total: number; breakdown: string; crit: string | null; dice3d?: { sides: number; value: number }[] }[] }>("/roll", { method: "POST", body: JSON.stringify({ expression, advantage, times }) }),
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

