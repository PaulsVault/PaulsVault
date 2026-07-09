import { useEffect, useState } from "react";
import { api } from "./api";
import { ABILITIES, ABILITY_LABEL, type AbilityKey, type ContentHit, type Sheet } from "./types";

export function CreateCharacter({ onCancel, onCreated }: { onCancel: () => void; onCreated: (s: Sheet) => void }) {
  const [classes, setClasses] = useState<ContentHit[]>([]);
  const [species, setSpecies] = useState<ContentHit[]>([]);
  const [backgrounds, setBackgrounds] = useState<ContentHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [className, setClassName] = useState("");
  const [speciesName, setSpeciesName] = useState("");
  const [background, setBackground] = useState("");
  const [level, setLevel] = useState(1);
  const [abilities, setAbilities] = useState<Record<AbilityKey, number>>({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 });

  useEffect(() => {
    void (async () => {
      const [cl, sp, bg] = await Promise.all([api.content("class"), api.content("species"), api.content("background")]);
      setClasses(cl); setSpecies(sp); setBackgrounds(bg);
      setClassName(cl[0]?.name ?? ""); setSpeciesName(sp[0]?.name ?? ""); setBackground(bg[0]?.name ?? "");
    })().catch((e) => setError((e as Error).message));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const sheet = await api.createCharacter({ name, className, species: speciesName, background, level, abilities });
      onCreated(sheet);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <section className="create">
      <div className="library-head">
        <h1>Nuevo personaje</h1>
        <button className="btn" onClick={onCancel}>← Volver</button>
      </div>

      <form className="form" onSubmit={submit}>
        <label className="field span2">
          <span>Nombre</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del personaje" />
        </label>

        <label className="field">
          <span>Clase</span>
          <select value={className} onChange={(e) => setClassName(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </label>

        <label className="field">
          <span>Nivel</span>
          <input type="number" min={1} max={20} value={level} onChange={(e) => setLevel(Number(e.target.value))} />
        </label>

        <label className="field">
          <span>Especie</span>
          <select value={speciesName} onChange={(e) => setSpeciesName(e.target.value)}>
            {species.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </label>

        <label className="field">
          <span>Trasfondo</span>
          <select value={background} onChange={(e) => setBackground(e.target.value)}>
            {backgrounds.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </label>

        <fieldset className="abilities-input span2">
          <legend>Características</legend>
          <div className="abil-grid">
            {ABILITIES.map((a) => (
              <label key={a} className="abil-field">
                <span>{ABILITY_LABEL[a]}</span>
                <input type="number" min={1} max={30} value={abilities[a]}
                  onChange={(e) => setAbilities({ ...abilities, [a]: Number(e.target.value) })} />
              </label>
            ))}
          </div>
        </fieldset>

        {error && <p className="error span2">⚠️ {error}</p>}

        <div className="span2 form-actions">
          <button className="btn primary" type="submit" disabled={busy || !name || !className}>
            {busy ? "Creando…" : "Crear personaje"}
          </button>
        </div>
      </form>
    </section>
  );
}
