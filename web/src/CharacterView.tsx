import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { Sheet } from "./types";
import { download, fileNameFor } from "./download";
import { LevelUpDialog } from "./LevelUpDialog";
import { preloadDice3D, type Die } from "./diceEngine";
import { dice3dEnabled } from "./theme";
import { DiceOverlay } from "./DiceOverlay";
import { presentRoll } from "./rollPresenter";
import { CharacterSheet } from "./CharacterSheet";

export interface RollRequest { type: string; target?: string; label: string; advantage?: string; critical?: boolean; faces?: number; damageExpr?: string; damageType?: string; }
import { CombatPanel } from "./panels/CombatPanel";
import { InfoPanel } from "./panels/InfoPanel";
import { SpellsPanel } from "./panels/SpellsPanel";
import { WildShapePanel } from "./panels/WildShapePanel";
import { InventoryPanel } from "./panels/InventoryPanel";
import { CompanionsPanel } from "./panels/CompanionsPanel";
import { DiceTray } from "./panels/DiceTray";
import { JournalPanel } from "./panels/JournalPanel";
import { StylePanel } from "./panels/StylePanel";

const TABS = ["Hoja", "Info", "Combate", "Conjuros", "Formas", "Inventario", "Compañeros", "Dados", "Diario", "Estilo"] as const;
type Tab = (typeof TABS)[number];

export function CharacterView({ id, onBack }: { id: string; onBack: () => void }) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Hoja");
  const [levelUp, setLevelUp] = useState(false);

  useEffect(() => { if (dice3dEnabled()) preloadDice3D("#7c5cff"); }, []);

  async function doRoll(req: RollRequest) {
    try {
      // Daño de truco (u otra expresión directa): se tira la fórmula, sin pasar por el motor de armas.
      if (req.type === "spell_damage" && req.damageExpr) {
        const res = await api.roll(req.damageExpr);
        const r0 = res.rolls[0];
        presentRoll({ label: req.label, total: r0.total, breakdown: r0.breakdown, detail: req.damageType, dice3d: r0.dice3d ?? [], faces: req.faces, profile: "heavy" });
        return;
      }
      const r = await api.check(id, { type: req.type, target: req.target, advantage: req.advantage ?? "normal", critical: req.critical }) as Record<string, unknown>;
      if (r["type"] === "damage") {
        presentRoll({ label: req.label + " · daño", total: r["total"] as number, breakdown: r["breakdown"] as string, detail: String(r["damageType"] ?? ""), dice3d: (r["dice3d"] as Die[]) ?? [], faces: req.faces, profile: "heavy" });
      } else {
        const crit = (r["crit"] as "critical" | "fumble" | null) ?? null;
        presentRoll({ label: req.label, total: r["roll"] as number, breakdown: r["breakdown"] as string, detail: r["modifierDetail"] as string, crit, natural: (r["natural"] as number | null) ?? null, profile: req.type === "attack" || req.type === "spell_attack" ? "fast" : "normal" });
      }
    } catch (e) {
      presentRoll({ label: "⚠️ " + req.label, total: 0, breakdown: (e as Error).message });
    }
  }

  const reload = useCallback(async () => {
    try { setSheet(await api.getSheet(id)); setError(null); }
    catch (e) { setError((e as Error).message); }
  }, [id]);

  async function doLevelDown() {
    if (!window.confirm("¿Bajar un nivel? Se quita el último nivel ganado: PG (promedio), rasgos de clase/subclase/dote de ese nivel y un dado de golpe. Los aumentos de característica (ASI) no se revierten automáticamente.")) return;
    try { await api.levelDown(id); await reload(); }
    catch (e) { window.alert("⚠️ " + (e as Error).message); }
  }

  useEffect(() => { void reload(); }, [reload]);

  if (error) return <div><button className="btn" onClick={onBack}>← Volver</button><p className="error">⚠️ {error}</p></div>;
  if (!sheet) return <p className="muted">Cargando…</p>;

  const s = sheet;
  const accent = s.style.accentColor ?? "#7c5cff";
  const diceColor = s.style.tokens?.dice ?? accent;
  const diceMaterial = s.style.tokens?.diceMaterial ?? "none";
  const hasSpells = !!s.spellcasting;
  const hasWildShape = !!s.wildShape;
  const tabs = TABS.filter((t) => (t !== "Conjuros" || hasSpells) && (t !== "Formas" || hasWildShape));

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
    <div className="sheet-wrap" style={{ ["--accent" as string]: accent, ["--dice" as string]: diceColor, fontFamily: s.style.fontFamily }}>
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
          <button className="btn small" onClick={doLevelDown}>⬇ Bajar nivel</button>
          <button className="btn small" onClick={exportJson} title="Exportar JSON">⬇ JSON</button>
          <button className="btn small" onClick={exportMd} title="Exportar hoja Markdown">⬇ MD</button>
          <button className="btn small" onClick={exportPackage} title="Paquete .dndchar autocontenido">⬇ .dndchar</button>
        </div>
      </div>

      {levelUp && (
        <LevelUpDialog id={id} classList={s.classList} onClose={() => setLevelUp(false)} onDone={() => { setLevelUp(false); void reload(); }} />
      )}

      <DiceOverlay themeColor={diceColor} material={diceMaterial} />

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
        {tab === "Hoja" && <CharacterSheet sheet={s} onRoll={doRoll} id={id} reload={reload} />}
        {tab === "Info" && <InfoPanel id={id} sheet={s} reload={reload} />}
        {tab === "Combate" && <CombatPanel id={id} sheet={s} reload={reload} />}
        {tab === "Conjuros" && hasSpells && <SpellsPanel id={id} sheet={s} reload={reload} />}
        {tab === "Formas" && hasWildShape && <WildShapePanel id={id} sheet={s} reload={reload} />}
        {tab === "Inventario" && <InventoryPanel id={id} reload={reload} />}
        {tab === "Compañeros" && <CompanionsPanel id={id} />}
        {tab === "Dados" && <DiceTray id={id} inspiration={s.inspiration} reload={reload} />}
        {tab === "Diario" && <JournalPanel id={id} sheet={s} reload={reload} />}
        {tab === "Estilo" && <StylePanel id={id} sheet={s} reload={reload} />}
      </div>
    </div>
  );
}
