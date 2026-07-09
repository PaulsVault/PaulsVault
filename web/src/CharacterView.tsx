import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { Sheet } from "./types";
import { download, fileNameFor } from "./download";
import { LevelUpDialog } from "./LevelUpDialog";
import { CharacterSheet } from "./CharacterSheet";
import { CombatPanel } from "./panels/CombatPanel";
import { SpellsPanel } from "./panels/SpellsPanel";
import { InventoryPanel } from "./panels/InventoryPanel";
import { CompanionsPanel } from "./panels/CompanionsPanel";
import { DiceTray } from "./panels/DiceTray";
import { StylePanel } from "./panels/StylePanel";

const TABS = ["Hoja", "Combate", "Conjuros", "Inventario", "Compañeros", "Dados", "Estilo"] as const;
type Tab = (typeof TABS)[number];

export function CharacterView({ id, onBack }: { id: string; onBack: () => void }) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Hoja");
  const [levelUp, setLevelUp] = useState(false);

  const reload = useCallback(async () => {
    try { setSheet(await api.getSheet(id)); setError(null); }
    catch (e) { setError((e as Error).message); }
  }, [id]);

  useEffect(() => { void reload(); }, [reload]);

  if (error) return <div><button className="btn" onClick={onBack}>← Volver</button><p className="error">⚠️ {error}</p></div>;
  if (!sheet) return <p className="muted">Cargando…</p>;

  const s = sheet;
  const accent = s.style.accentColor ?? "#7c5cff";
  const hasSpells = !!s.spellcasting;
  const tabs = TABS.filter((t) => t !== "Conjuros" || hasSpells);
  const primaryClass = s.classes.split(" / ")[0].replace(/\s*\([^)]*\)/, "").replace(/\s+\d+$/, "").trim();

  async function exportJson() {
    const r = await api.exportCharacter(id, "json") as { character: unknown };
    download(fileNameFor(s.name, "json"), JSON.stringify(r.character, null, 2));
  }
  async function exportMd() {
    const r = await api.exportCharacter(id, "markdown") as { markdown: string };
    download(fileNameFor(s.name, "md"), r.markdown, "text/markdown");
  }
  async function exportPackage() {
    const pkg = await api.packageCharacter(id);
    download(fileNameFor(s.name, "dndchar"), JSON.stringify(pkg, null, 2));
  }

  return (
    <div className="sheet-wrap" style={{ ["--accent" as string]: accent, fontFamily: s.style.fontFamily }}>
      <div className="sheet-top">
        <button className="btn" onClick={onBack}>← Biblioteca</button>
        {s.modifiers.active.length > 0 && (
          <div className="state-bar">
            {s.modifiers.incapacitated && <span className="chip danger">Incapacitado</span>}
            {s.modifiers.active.map((a) => <span key={a} className="chip">{a}</span>)}
          </div>
        )}
        <div className="spacer" />
        <div className="row wrap">
          <button className="btn small" onClick={() => setLevelUp(true)}>⬆ Subir nivel</button>
          <button className="btn small" onClick={exportJson} title="Exportar JSON">⬇ JSON</button>
          <button className="btn small" onClick={exportMd} title="Exportar hoja Markdown">⬇ MD</button>
          <button className="btn small" onClick={exportPackage} title="Paquete .dndchar autocontenido">⬇ .dndchar</button>
        </div>
      </div>

      {levelUp && (
        <LevelUpDialog id={id} defaultClass={primaryClass} onClose={() => setLevelUp(false)} onDone={() => { setLevelUp(false); void reload(); }} />
      )}

      <header className="sheet-header">
        {s.style.showPortrait !== false && (
          <div className="portrait" aria-hidden>
            {s.style.artUrl ? <img src={s.style.artUrl} alt="" /> : <span>{s.name.charAt(0).toUpperCase()}</span>}
          </div>
        )}
        <div className="sheet-id">
          <h1>{s.name}</h1>
          <p className="muted">{s.classes} · {s.species} · {s.background}</p>
        </div>
        <div className="hp-inline">
          <span className="hp-val">{s.hp.current}/{s.hp.max}</span>
          {s.hp.temp > 0 && <span className="hp-temp">+{s.hp.temp}</span>}
          <span className="muted small">PG</span>
          {s.inspiration && <span className="chip inspire">✨</span>}
        </div>
      </header>

      <nav className="tabs">
        {tabs.map((t) => (
          <button key={t} className={`tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </nav>

      <div className="tab-body">
        {tab === "Hoja" && <CharacterSheet sheet={s} />}
        {tab === "Combate" && <CombatPanel id={id} sheet={s} reload={reload} />}
        {tab === "Conjuros" && hasSpells && <SpellsPanel id={id} sheet={s} reload={reload} />}
        {tab === "Inventario" && <InventoryPanel id={id} reload={reload} />}
        {tab === "Compañeros" && <CompanionsPanel id={id} />}
        {tab === "Dados" && <DiceTray id={id} />}
        {tab === "Estilo" && <StylePanel id={id} sheet={s} reload={reload} />}
      </div>
    </div>
  );
}
