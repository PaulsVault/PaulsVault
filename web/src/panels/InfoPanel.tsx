import { useState } from "react";
import { api } from "../api";
import { FeatureDesc } from "../FeatureDesc";
import type { Personality, Sheet } from "../types";

export function InfoPanel({ id, sheet: s, reload }: { id: string; sheet: Sheet; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [p, setP] = useState<Personality>(s.personality ?? {});
  const [bio, setBio] = useState({ appearance: s.appearance ?? "", backstory: s.backstory ?? "" });

  async function run(fn: () => Promise<unknown>, msg?: string) {
    setBusy(true); setNote(null);
    try { await fn(); await reload(); if (msg) setNote(msg); }
    catch (e) { setNote("⚠️ " + (e as Error).message); }
    finally { setBusy(false); }
  }

  const savePersonality = () =>
    run(() => api.updateCharacter(id, { personality: p, appearance: bio.appearance, backstory: bio.backstory }), "Personalidad e historia guardadas");

  return (
    <div className="stack">
      {note && <p className="note">{note}</p>}

      <section className="panel">
        <h2>Información</h2>
        <div className="info-grid">
          <div><span className="muted small">Especie</span><b>{s.species}</b></div>
          <div><span className="muted small">Trasfondo</span><b>{s.background}</b></div>
          <div><span className="muted small">Alineación</span><b>{s.alignment ?? "—"}</b></div>
          <div><span className="muted small">Clases</span><b>{s.classList.map((c) => `${c.name}${c.subclass ? ` (${c.subclass})` : ""} ${c.level}`).join(" / ")}</b></div>
        </div>
      </section>

      {s.speciesTraits.length > 0 && (
        <section className="panel">
          <h2>Rasgos raciales · {s.species}</h2>
          <ul className="trait-list">{s.speciesTraits.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </section>
      )}

      {s.features.length > 0 && (
        <section className="panel">
          <h2>Rasgos de clase, subclase y dotes</h2>
          <ul className="line-list">
            {s.features.map((f) => (
              <li key={`${f.name}-${f.source}`} style={{ display: "block" }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <b>{f.name}</b><span className="muted small">{f.source}</span>
                </div>
                {f.description && <FeatureDesc text={f.description} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2>Personalidad e historia</h2>
        <div className="form">
          <label className="field"><span>Rasgos de personalidad</span><textarea rows={2} value={p.traits ?? ""} onChange={(e) => setP({ ...p, traits: e.target.value })} /></label>
          <label className="field"><span>Ideales</span><textarea rows={2} value={p.ideals ?? ""} onChange={(e) => setP({ ...p, ideals: e.target.value })} /></label>
          <label className="field"><span>Vínculos (lazos)</span><textarea rows={2} value={p.bonds ?? ""} onChange={(e) => setP({ ...p, bonds: e.target.value })} /></label>
          <label className="field"><span>Defectos</span><textarea rows={2} value={p.flaws ?? ""} onChange={(e) => setP({ ...p, flaws: e.target.value })} /></label>
          <label className="field span2"><span>Apariencia</span><textarea rows={2} value={bio.appearance} onChange={(e) => setBio({ ...bio, appearance: e.target.value })} /></label>
          <label className="field span2"><span>Historia</span><textarea rows={4} value={bio.backstory} onChange={(e) => setBio({ ...bio, backstory: e.target.value })} /></label>
          <div className="span2 form-actions"><button className="btn primary" disabled={busy} onClick={savePersonality}>Guardar</button></div>
        </div>
      </section>
    </div>
  );
}
