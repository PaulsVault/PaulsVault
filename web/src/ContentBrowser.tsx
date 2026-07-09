import { useEffect, useState } from "react";
import { api } from "./api";
import { readFile } from "./download";
import type { ContentHit } from "./types";

const TYPES = ["", "class", "subclass", "species", "background", "feat", "spell", "item", "condition", "monster", "rule"];
interface Pack { id: string; name: string; version: string; source: string; entryCounts: Record<string, number>; }

export function ContentBrowser({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [results, setResults] = useState<ContentHit[]>([]);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [note, setNote] = useState<string | null>(null);

  async function search() {
    const r = await api.searchContent({ query, type: type || undefined, limit: 60 });
    setResults(r.results); setTotal(r.total);
  }
  async function loadPacks() { setPacks(await api.listPacks()); }

  useEffect(() => { void search(); void loadPacks(); }, []);
  useEffect(() => { void search(); }, [type]);

  async function toggle(name: string) {
    if (open === name) { setOpen(null); setDetail(null); return; }
    setOpen(name);
    try { setDetail((await api.getEntry(name)).data); } catch { setDetail(null); }
  }

  async function importPackFile(file: File) {
    setNote(null);
    try {
      const pack = JSON.parse(await readFile(file));
      const r = await api.importPack(pack) as { packId?: string; entryCount?: number };
      setNote(`Pack "${r.packId}" importado (${r.entryCount} entradas).`);
      await loadPacks(); await search();
    } catch (e) { setNote("⚠️ " + (e as Error).message); }
  }

  async function removePack(pid: string) {
    if (!confirm(`¿Eliminar el pack "${pid}"? (srd-core se resiembra al reiniciar)`)) return;
    try { await api.deletePack(pid); await loadPacks(); await search(); } catch (e) { setNote("⚠️ " + (e as Error).message); }
  }

  return (
    <section className="stack">
      <div className="library-head">
        <h1>Biblioteca de contenido</h1>
        <button className="btn" onClick={onBack}>← Volver</button>
      </div>
      {note && <p className="note">{note}</p>}

      <div className="panel">
        <h2>Content packs</h2>
        <ul className="line-list">
          {packs.map((p) => (
            <li key={p.id}>
              <span><b>{p.name}</b> <span className="muted small">v{p.version} · {Object.entries(p.entryCounts).map(([t, n]) => `${n} ${t}`).join(", ")}</span></span>
              <button className="icon-btn" title="Eliminar pack" onClick={() => removePack(p.id)}>🗑</button>
            </li>
          ))}
        </ul>
        <label className="btn small" style={{ display: "inline-block", cursor: "pointer" }}>
          + Importar pack (.json)
          <input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importPackFile(e.target.files[0])} />
        </label>
        <p className="muted small">La biblioteca es ilimitada: reimportar un pack con el mismo id lo actualiza.</p>
      </div>

      <div className="panel">
        <h2>Buscar</h2>
        <div className="row wrap">
          <input placeholder="Texto…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} style={{ minWidth: 160 }} />
          <select value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map((t) => <option key={t} value={t}>{t || "todos"}</option>)}</select>
          <button className="btn" onClick={search}>Buscar</button>
          <span className="muted small">{total} resultados</span>
        </div>
        <ul className="line-list">
          {results.map((r) => (
            <li key={r.id} style={{ display: "block" }}>
              <div className="row" style={{ justifyContent: "space-between", cursor: "pointer" }} onClick={() => toggle(r.name)}>
                <span><b>{r.name}</b> <span className="muted small">· {r.type} · {r.pack}</span></span>
                <span className="muted">{open === r.name ? "▲" : "▼"}</span>
              </div>
              {open === r.name && detail && (
                <pre className="entry-detail">{JSON.stringify(detail, null, 2)}</pre>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
