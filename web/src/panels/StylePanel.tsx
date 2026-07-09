import { useState } from "react";
import { api } from "../api";
import type { Sheet } from "../types";

const THEMES = ["classic", "dark", "parchment", "arcane", "infernal", "nature"];
const LAYOUTS = ["classic", "compact", "spellcaster", "landscape"];

export function StylePanel({ id, sheet, reload }: { id: string; sheet: Sheet; reload: () => Promise<void> }) {
  const st = sheet.style;
  const [theme, setTheme] = useState(st.theme ?? "classic");
  const [accentColor, setAccentColor] = useState(st.accentColor ?? "#7c5cff");
  const [fontFamily, setFontFamily] = useState(st.fontFamily ?? "");
  const [layout, setLayout] = useState(st.layout ?? "classic");
  const [showPortrait, setShowPortrait] = useState(st.showPortrait !== false);
  const [artUrl, setArtUrl] = useState(st.artUrl ?? "");
  const [customCss, setCustomCss] = useState(st.customCss ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function save() {
    setBusy(true); setNote(null);
    try {
      await api.style(id, { theme, accentColor, fontFamily: fontFamily || undefined, layout, showPortrait, artUrl, customCss });
      await reload();
      setNote("Estilo guardado ✓");
    } catch (e) { setNote("⚠️ " + (e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="stack">
      {note && <p className="note">{note}</p>}
      <section className="panel">
        <h2>Apariencia de la hoja</h2>
        <div className="form">
          <label className="field"><span>Tema</span>
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>{THEMES.map((t) => <option key={t}>{t}</option>)}</select>
          </label>
          <label className="field"><span>Color de acento</span>
            <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} style={{ height: 42, padding: 4 }} />
          </label>
          <label className="field"><span>Tipografía (CSS font-family)</span>
            <input value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} placeholder="p.ej. Georgia, serif" />
          </label>
          <label className="field"><span>Layout</span>
            <select value={layout} onChange={(e) => setLayout(e.target.value)}>{LAYOUTS.map((l) => <option key={l}>{l}</option>)}</select>
          </label>
          <label className="field span2"><span>URL del retrato</span>
            <input value={artUrl} onChange={(e) => setArtUrl(e.target.value)} placeholder="https://… o data:image/…" />
          </label>
          <label className="field inline span2"><input type="checkbox" checked={showPortrait} onChange={(e) => setShowPortrait(e.target.checked)} /> Mostrar retrato</label>
          <label className="field span2"><span>CSS personalizado</span>
            <textarea value={customCss} onChange={(e) => setCustomCss(e.target.value)} rows={4} placeholder=".panel { border-radius: 4px; }" />
          </label>
          <div className="span2 form-actions">
            <button className="btn primary" disabled={busy} onClick={save}>{busy ? "Guardando…" : "Guardar estilo"}</button>
          </div>
        </div>
      </section>
    </div>
  );
}
