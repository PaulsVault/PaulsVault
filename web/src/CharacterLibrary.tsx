import { useEffect, useState } from "react";
import { api } from "./api";
import { readFile } from "./download";
import type { CharacterSummary } from "./types";
import { CreateCharacter } from "./CreateCharacter";

export function CharacterLibrary({ onOpen }: { onOpen: (id: string) => void }) {
  const [list, setList] = useState<CharacterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      setList(await api.listCharacters());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function importFile(file: File) {
    setError(null);
    try {
      const parsed = JSON.parse(await readFile(file)) as { format?: string; character?: unknown };
      if (parsed?.format === "dndchar") await api.importPackage(parsed);
      else await api.importCharacter(parsed.character ?? parsed);
      await refresh();
    } catch (e) {
      setError("No se pudo importar: " + (e as Error).message);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`¿Eliminar a "${name}"? Es irreversible.`)) return;
    await api.deleteCharacter(id);
    void refresh();
  }

  const shown = list.filter((c) =>
    `${c.name} ${c.classes} ${c.species}`.toLowerCase().includes(filter.toLowerCase()));

  if (creating) {
    return (
      <CreateCharacter
        onCancel={() => setCreating(false)}
        onCreated={(sheet) => { setCreating(false); onOpen(sheet.id); }}
      />
    );
  }

  return (
    <section className="library">
      <div className="library-head">
        <h1>Personajes</h1>
        <div className="row wrap">
          <label className="btn" style={{ cursor: "pointer" }}>
            ⬆ Importar
            <input type="file" accept=".json,.dndchar,application/json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
          </label>
          <button className="btn primary" onClick={() => setCreating(true)}>+ Nuevo personaje</button>
        </div>
      </div>

      {list.length > 3 && (
        <input className="search" placeholder="Buscar por nombre, clase o especie…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      )}

      {loading && <p className="muted">Cargando…</p>}
      {error && <p className="error">⚠️ {error}</p>}

      {!loading && !error && list.length === 0 && (
        <div className="empty">
          <p>Aún no tienes personajes.</p>
          <button className="btn primary" onClick={() => setCreating(true)}>Crear el primero</button>
        </div>
      )}

      <div className="card-grid">
        {shown.map((c) => (
          <article key={c.id} className="char-card" onClick={() => onOpen(c.id)}>
            <div className="char-avatar" aria-hidden>{c.name.charAt(0).toUpperCase()}</div>
            <div className="char-info">
              <h3>{c.name}</h3>
              <p className="muted">{c.classes || "—"} · {c.species}</p>
              <p className="char-hp">PG {c.hp}</p>
            </div>
            <button className="icon-btn" title="Eliminar" onClick={(e) => { e.stopPropagation(); void remove(c.id, c.name); }}>🗑</button>
          </article>
        ))}
      </div>
    </section>
  );
}
