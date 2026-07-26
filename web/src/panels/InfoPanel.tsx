import { useEffect, useState } from "react";
import { api } from "../api";
import { FeatureDesc } from "../FeatureDesc";
import { ABILITIES, ABILITY_LABEL, type AbilityKey, type ContentHit, type Personality, type Sheet } from "../types";

type FeatChoice = { from: string[]; count: number; amount: number };

// Valores manuales editables de la hoja, tomados de la hoja actual.
type Adj = { hpMax: number; hpCurrent: number; hpTemp: number; acOverride: number | ""; speed: number; initiativeBonus: number; xp: number; abilities: Record<AbilityKey, number> };
const initAdj = (s: Sheet): Adj => ({
  hpMax: s.hp.max, hpCurrent: s.hp.current, hpTemp: s.hp.temp,
  acOverride: s.acOverride ?? "", speed: s.speedBase, initiativeBonus: s.initiativeBonusManual ?? 0, xp: s.xp ?? 0,
  abilities: Object.fromEntries(ABILITIES.map((a) => [a, s.abilities[a].score])) as Record<AbilityKey, number>,
});

export function InfoPanel({ id, sheet: s, reload }: { id: string; sheet: Sheet; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [p, setP] = useState<Personality>(s.personality ?? {});
  const [bio, setBio] = useState({ appearance: s.appearance ?? "", backstory: s.backstory ?? "" });
  const [featQuery, setFeatQuery] = useState("");
  const [feats, setFeats] = useState<ContentHit[]>([]);
  // Media dote a otorgar: exige elegir característica antes de confirmar el regalo.
  const [pending, setPending] = useState<{ name: string; choice: FeatChoice; abil: Partial<Record<AbilityKey, number>> } | null>(null);
  // Ajustes manuales de la hoja (se re-sincronizan con la hoja al recargar).
  const [adj, setAdj] = useState<Adj>(() => initAdj(s));
  const [showAdj, setShowAdj] = useState(false);
  useEffect(() => { setAdj(initAdj(s)); /* eslint-disable-next-line */ }, [s.hp.max, s.hp.current, s.hp.temp, s.acOverride, s.speedBase, s.initiativeBonusManual, s.xp, s.abilities]);

  const saveAdjustments = () => run(() => api.updateCharacter(id, {
    hpMax: adj.hpMax, hpCurrent: adj.hpCurrent, hpTemp: adj.hpTemp,
    acOverride: adj.acOverride === "" ? null : Number(adj.acOverride),
    speed: Number(adj.speed), initiativeBonus: Number(adj.initiativeBonus), xp: Number(adj.xp),
    abilities: adj.abilities,
  }), "Ajustes manuales guardados");

  async function searchFeats() {
    if (featQuery.trim().length < 2) { setFeats([]); return; }
    setFeats(await api.content("feat", featQuery));
  }
  // Al otorgar: si la dote es media dote (elige +1 a X o Y), pide la característica primero.
  async function startGrant(name: string) {
    try {
      const e = await api.getEntry(name);
      const choice = (e.data as { abilityChoice?: FeatChoice }).abilityChoice;
      if (choice) { setPending({ name, choice, abil: {} }); return; }
    } catch { /* si falla la consulta, se otorga sin elección */ }
    void grant(name);
  }
  const grant = (name: string, abilities?: Record<string, number>) =>
    run(async () => { await api.grantFeat(id, name, undefined, abilities); setFeats([]); setFeatQuery(""); setPending(null); }, `Otorgada: ${name}`);
  const togglePendingAbil = (a: AbilityKey) => setPending((cur) => {
    if (!cur) return cur;
    if (cur.abil[a]) { const { [a]: _drop, ...rest } = cur.abil; return { ...cur, abil: rest }; }
    if (Object.keys(cur.abil).length >= cur.choice.count) return cur;
    return { ...cur, abil: { ...cur.abil, [a]: cur.choice.amount } };
  });

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
          <div><span className="muted small">Velocidad</span><b>{s.speed} ft</b></div>
          {s.languages && s.languages.length > 0 && <div><span className="muted small">Idiomas</span><b>{s.languages.join(", ")}</b></div>}
          {s.tools && s.tools.length > 0 && <div><span className="muted small">Herramientas</span><b>{s.tools.join(", ")}</b></div>}
        </div>
        {s.backgroundDescription && <p className="cond-desc" style={{ marginTop: 10 }}>{s.backgroundDescription}</p>}
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
                  <b>{f.name}</b>
                  <span className="row">
                    <span className="muted small">{f.source}</span>
                    {f.source === "Regalo de campaña" && <button className="icon-btn" title="Quitar regalo" disabled={busy} onClick={() => run(() => api.updateCharacter(id, { removeFeatures: [f.name] }), `Quitada: ${f.name}`)}>🗑</button>}
                  </span>
                </div>
                {f.description && <FeatureDesc text={f.description} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2>🎁 Dotes y regalos de campaña</h2>
        <p className="muted small">Otorga cualquier dote (incluidas las homebrew) en cualquier momento — como recompensa o buff. Aplica sus efectos a la hoja igual que una dote normal.</p>
        <div className="row">
          <input placeholder="Buscar dote (≥2 letras)…" value={featQuery} onChange={(e) => setFeatQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchFeats()} />
          <button className="btn" onClick={searchFeats}>Buscar</button>
        </div>
        {feats.length > 0 && (
          <ul className="line-list" style={{ marginTop: 8 }}>
            {feats.slice(0, 14).map((f) => (
              <li key={f.id}>
                <span><b>{f.name}</b>{f.preview && <span className="muted small"> · {f.preview}</span>}</span>
                <button className="btn small primary" disabled={busy} onClick={() => startGrant(f.name)}>+ Otorgar</button>
              </li>
            ))}
          </ul>
        )}
        {pending && (
          <div className="panel" style={{ marginTop: 8 }}>
            <p style={{ margin: "0 0 6px" }}><b>{pending.name}</b> — media dote: elige {pending.choice.count === 1 ? "una característica" : `${pending.choice.count} características`} para +{pending.choice.amount} ({Object.keys(pending.abil).length}/{pending.choice.count}):</p>
            <div className="chips">
              {pending.choice.from.map((a) => {
                const key = a as AbilityKey;
                const on = !!pending.abil[key];
                return <button type="button" key={a} className={`chip${on ? " removable" : ""}`} onClick={() => togglePendingAbil(key)}>{on ? "✓ " : ""}{ABILITY_LABEL[key] ?? a.toUpperCase()} +{pending.choice.amount}</button>;
              })}
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn small" onClick={() => setPending(null)}>Cancelar</button>
              <button className="btn small primary" disabled={busy || Object.keys(pending.abil).length !== pending.choice.count} onClick={() => grant(pending.name, pending.abil as Record<string, number>)}>Confirmar regalo</button>
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="collapse-h" onClick={() => setShowAdj((v) => !v)} title="Mostrar/ocultar">
          <span>⚙️ Ajustes manuales de la hoja</span><span className="muted">{showAdj ? "▲" : "▼"}</span>
        </h2>
        {showAdj && (
          <>
            <p className="muted small">Edita valores a mano para mayor customización. Los ajustes se guardan tal cual; recalcular (subir de nivel, cambiar equipo) puede volver a moverlos.</p>
            <fieldset className="abilities-input span2">
              <legend>Puntos de golpe</legend>
              <div className="row wrap">
                <label className="field"><span>Máximo</span><input type="number" min={1} value={adj.hpMax} onChange={(e) => setAdj({ ...adj, hpMax: Number(e.target.value) })} style={{ maxWidth: 100 }} /></label>
                <label className="field"><span>Actuales</span><input type="number" value={adj.hpCurrent} onChange={(e) => setAdj({ ...adj, hpCurrent: Number(e.target.value) })} style={{ maxWidth: 100 }} /></label>
                <label className="field"><span>Temporales</span><input type="number" min={0} value={adj.hpTemp} onChange={(e) => setAdj({ ...adj, hpTemp: Number(e.target.value) })} style={{ maxWidth: 100 }} /></label>
              </div>
            </fieldset>
            <fieldset className="abilities-input span2">
              <legend>Otros valores</legend>
              <div className="row wrap">
                <label className="field"><span>CA fija (vacío = automática)</span><input type="number" value={adj.acOverride} onChange={(e) => setAdj({ ...adj, acOverride: e.target.value === "" ? "" : Number(e.target.value) })} style={{ maxWidth: 120 }} /></label>
                <label className="field"><span>Velocidad (ft)</span><input type="number" min={0} value={adj.speed} onChange={(e) => setAdj({ ...adj, speed: Number(e.target.value) })} style={{ maxWidth: 110 }} /></label>
                <label className="field"><span>Bono de iniciativa</span><input type="number" value={adj.initiativeBonus} onChange={(e) => setAdj({ ...adj, initiativeBonus: Number(e.target.value) })} style={{ maxWidth: 120 }} /></label>
                <label className="field"><span>XP</span><input type="number" min={0} value={adj.xp} onChange={(e) => setAdj({ ...adj, xp: Number(e.target.value) })} style={{ maxWidth: 110 }} /></label>
              </div>
            </fieldset>
            <fieldset className="abilities-input span2">
              <legend>Características</legend>
              <div className="abil-grid">
                {ABILITIES.map((a) => (
                  <label key={a} className="abil-field"><span>{ABILITY_LABEL[a]}</span>
                    <input type="number" min={1} max={30} value={adj.abilities[a]} onChange={(e) => setAdj({ ...adj, abilities: { ...adj.abilities, [a]: Number(e.target.value) } })} />
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="span2 form-actions">
              <button className="btn" disabled={busy} onClick={() => setAdj(initAdj(s))}>Restablecer</button>
              <button className="btn primary" disabled={busy} onClick={saveAdjustments}>Guardar ajustes</button>
            </div>
          </>
        )}
      </section>

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
