import { useState } from "react";
import { api } from "../api";
import type { Sheet } from "../types";

const THEMES = ["classic", "dark", "parchment", "arcane", "infernal", "nature"];
const LAYOUTS = ["classic", "compact", "spellcaster", "landscape"];
const DICE_MATERIALS: { value: string; label: string }[] = [
  { value: "none", label: "Plástico" },
  { value: "metal", label: "Metal" },
  { value: "glass", label: "Cristal" },
  { value: "wood", label: "Madera" },
];

// Plantillas rápidas: aplican tema + acento + tipografía de un clic.
const TEMPLATES: { name: string; theme: string; accentColor: string; fontFamily: string }[] = [
  { name: "🏆 Épico dorado", theme: "arcane", accentColor: "#c79a3f", fontFamily: '"Cinzel", Georgia, serif' },
  { name: "🔮 Arcano violeta", theme: "arcane", accentColor: "#7c5cff", fontFamily: "" },
  { name: "🔥 Infernal", theme: "infernal", accentColor: "#e0533b", fontFamily: "" },
  { name: "🌿 Bosque", theme: "nature", accentColor: "#4caf72", fontFamily: "" },
  { name: "🌊 Marino", theme: "dark", accentColor: "#2f8fd0", fontFamily: "" },
  { name: "📜 Pergamino", theme: "parchment", accentColor: "#a9842a", fontFamily: "Georgia, serif" },
];

export function StylePanel({ id, sheet, reload }: { id: string; sheet: Sheet; reload: () => Promise<void> }) {
  const st = sheet.style;
  const [theme, setTheme] = useState(st.theme ?? "classic");
  const [accentColor, setAccentColor] = useState(st.accentColor ?? "#7c5cff");
  const [fontFamily, setFontFamily] = useState(st.fontFamily ?? "");
  const [layout, setLayout] = useState(st.layout ?? "classic");
  const [showPortrait, setShowPortrait] = useState(st.showPortrait !== false);
  const [artUrl, setArtUrl] = useState(st.artUrl ?? "");
  const [diceColor, setDiceColor] = useState(st.tokens?.dice ?? st.accentColor ?? "#7c5cff");
  const [diceMaterial, setDiceMaterial] = useState(st.tokens?.diceMaterial ?? "none");
  const [customCss, setCustomCss] = useState(st.customCss ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  function applyTemplate(t: (typeof TEMPLATES)[number]) {
    setTheme(t.theme); setAccentColor(t.accentColor); setFontFamily(t.fontFamily); setDiceColor(t.accentColor);
    setNote(`Plantilla «${t.name}» aplicada — pulsa «Guardar estilo».`);
  }

  async function save() {
    setBusy(true); setNote(null);
    try {
      await api.style(id, { theme, accentColor, fontFamily: fontFamily || undefined, layout, showPortrait, artUrl, customCss, tokens: { ...(st.tokens ?? {}), dice: diceColor, diceMaterial } });
      await reload();
      setNote("Estilo guardado ✓");
    } catch (e) { setNote("⚠️ " + (e as Error).message); }
    finally { setBusy(false); }
  }

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) { setNote("⚠️ Imagen muy grande (máx ~1.5 MB). Usa una más pequeña o una URL."); return; }
    const reader = new FileReader();
    reader.onload = () => { setArtUrl(String(reader.result)); setNote("Imagen cargada — pulsa «Guardar estilo»."); };
    reader.readAsDataURL(file);
  }

  return (
    <div className="stack">
      {note && <p className="note">{note}</p>}

      <section className="panel">
        <h2>Plantillas rápidas</h2>
        <div className="template-row">
          {TEMPLATES.map((t) => (
            <button key={t.name} className="btn small template-chip" onClick={() => applyTemplate(t)} style={{ borderColor: t.accentColor }}>
              <span className="swatch" style={{ background: t.accentColor }} />{t.name}
            </button>
          ))}
        </div>
        <p className="muted small">Aplican tema, acento, tipografía y color de dados de una vez. El modo claro/oscuro global se cambia con el botón ☀️/🌙 de la barra superior.</p>
      </section>

      <section className="panel">
        <h2>Apariencia de la hoja</h2>
        <div className="form">
          <label className="field"><span>Tema</span>
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>{THEMES.map((t) => <option key={t}>{t}</option>)}</select>
          </label>
          <label className="field"><span>Color de acento</span>
            <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} style={{ height: 42, padding: 4 }} />
          </label>
          <label className="field"><span>🎲 Color de dados</span>
            <input type="color" value={diceColor} onChange={(e) => setDiceColor(e.target.value)} style={{ height: 42, padding: 4 }} />
          </label>
          <label className="field"><span>🎲 Material de dados (3D)</span>
            <select value={diceMaterial} onChange={(e) => setDiceMaterial(e.target.value)}>
              {DICE_MATERIALS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          <label className="field"><span>Tipografía (CSS font-family)</span>
            <input value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} placeholder="p.ej. Georgia, serif" />
          </label>
          <label className="field"><span>Layout</span>
            <select value={layout} onChange={(e) => setLayout(e.target.value)}>{LAYOUTS.map((l) => <option key={l}>{l}</option>)}</select>
          </label>
          <label className="field span2"><span>Retrato (URL o data:image)</span>
            <input value={artUrl} onChange={(e) => setArtUrl(e.target.value)} placeholder="https://… o data:image/…" />
          </label>
          <label className="field span2"><span>…o sube una imagen desde tu dispositivo</span>
            <input type="file" accept="image/*" onChange={onUpload} />
          </label>
          {artUrl && <div className="field span2 portrait-preview"><img src={artUrl} alt="retrato" /></div>}
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
