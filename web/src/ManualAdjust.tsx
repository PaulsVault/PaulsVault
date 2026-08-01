import { useEffect, useState } from "react";
import { api } from "./api";
import { ABILITIES, ABILITY_LABEL, type AbilityKey, type Sheet } from "./types";

// Valores manuales editables de la hoja, tomados de la hoja actual.
type Adj = { hpMax: number; hpCurrent: number; hpTemp: number; acOverride: number | ""; speed: number; initiativeBonus: number; xp: number; abilities: Record<AbilityKey, number> };
const initAdj = (s: Sheet): Adj => ({
  hpMax: s.hp.max, hpCurrent: s.hp.current, hpTemp: s.hp.temp,
  acOverride: s.acOverride ?? "", speed: s.speedBase, initiativeBonus: s.initiativeBonusManual ?? 0, xp: s.xp ?? 0,
  abilities: Object.fromEntries(ABILITIES.map((a) => [a, s.abilities[a].score])) as Record<AbilityKey, number>,
});

/** Sección "Ajustes manuales" de la hoja: editar a mano PG, CA, velocidad, iniciativa, características y XP. */
export function ManualAdjust({ id, sheet: s, reload }: { id: string; sheet: Sheet; reload: () => Promise<void> }) {
  const [adj, setAdj] = useState<Adj>(() => initAdj(s));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { setAdj(initAdj(s)); /* eslint-disable-next-line */ }, [s.hp.max, s.hp.current, s.hp.temp, s.acOverride, s.speedBase, s.initiativeBonusManual, s.xp, s.abilities]);

  async function save() {
    setBusy(true); setNote(null);
    try {
      await api.updateCharacter(id, {
        hpMax: adj.hpMax, hpCurrent: adj.hpCurrent, hpTemp: adj.hpTemp,
        acOverride: adj.acOverride === "" ? null : Number(adj.acOverride),
        speed: Number(adj.speed), initiativeBonus: Number(adj.initiativeBonus), xp: Number(adj.xp),
        abilities: adj.abilities,
      });
      await reload();
      setNote("Ajustes guardados.");
    } catch (e) { setNote("⚠️ " + (e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <section className="panel">
      <h2 className="collapse-h" onClick={() => setOpen((v) => !v)} title="Mostrar/ocultar">
        <span>⚙️ Ajustes manuales</span><span className="muted">{open ? "▲" : "▼"}</span>
      </h2>
      {open && (
        <div className="form">
          {note && <p className="note span2">{note}</p>}
          <p className="muted small span2">Edita valores a mano para más customización. Se guardan tal cual; recalcular (subir de nivel, cambiar equipo) puede volver a moverlos.</p>
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
            <button className="btn primary" disabled={busy} onClick={save}>Guardar ajustes</button>
          </div>
        </div>
      )}
    </section>
  );
}
