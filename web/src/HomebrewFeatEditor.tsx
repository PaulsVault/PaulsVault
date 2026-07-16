import { useState } from "react";
import { api } from "./api";

// Efecto continuo en la hoja (se convierte a StatModifier del dominio).
interface StatMod { target: string; op: string; value?: number; ability?: string }
interface EffectRow { kind: string; value: number; ability: string }

const ABILS: { k: string; label: string }[] = [
  { k: "str", label: "Fuerza" }, { k: "dex", label: "Destreza" }, { k: "con", label: "Constitución" },
  { k: "int", label: "Inteligencia" }, { k: "wis", label: "Sabiduría" }, { k: "cha", label: "Carisma" },
];
const CATEGORIES: { k: string; label: string }[] = [
  { k: "O", label: "Origen (nivel 1)" }, { k: "G", label: "General (nivel 4+)" },
  { k: "FS", label: "Estilo de combate" }, { k: "EB", label: "Don épico" },
];
const EFFECTS: { key: string; label: string; value?: boolean; ability?: boolean }[] = [
  { key: "ac", label: "Bono a CA", value: true },
  { key: "speed", label: "Bono a velocidad (ft)", value: true },
  { key: "save_all", label: "Bono a todas las salvaciones", value: true },
  { key: "save_one", label: "Bono a salvación de…", value: true, ability: true },
  { key: "check", label: "Bono a pruebas de habilidad", value: true },
  { key: "initiative", label: "Bono a iniciativa", value: true },
  { key: "attack", label: "Bono a tiradas de ataque", value: true },
  { key: "damage", label: "Bono al daño", value: true },
  { key: "adv_save", label: "Ventaja en salvación de…", ability: true },
  { key: "dis_save", label: "Desventaja en salvación de…", ability: true },
  { key: "adv_init", label: "Ventaja en iniciativa" },
];
const SKILL_LABEL: Record<string, string> = {
  acrobatics: "Acrobacias", "animal handling": "T. con Animales", arcana: "Arcanos", athletics: "Atletismo",
  deception: "Engaño", history: "Historia", insight: "Perspicacia", intimidation: "Intimidación",
  investigation: "Investigación", medicine: "Medicina", nature: "Naturaleza", perception: "Percepción",
  performance: "Interpretación", persuasion: "Persuasión", religion: "Religión", "sleight of hand": "Juego de Manos",
  stealth: "Sigilo", survival: "Supervivencia",
};
const ALL_SKILLS = Object.keys(SKILL_LABEL);

function toStatMod(r: EffectRow): StatMod {
  const v = Number(r.value) || 0;
  switch (r.kind) {
    case "ac": return { target: "ac", op: "add", value: v };
    case "speed": return { target: "speed", op: "add", value: v };
    case "save_all": return { target: "save", op: "add", value: v };
    case "save_one": return { target: "save", op: "add", value: v, ability: r.ability };
    case "check": return { target: "check", op: "add", value: v };
    case "initiative": return { target: "initiative", op: "add", value: v };
    case "attack": return { target: "attack", op: "add", value: v };
    case "damage": return { target: "damage", op: "add", value: v };
    case "adv_save": return { target: "save", op: "advantage", ability: r.ability };
    case "dis_save": return { target: "save", op: "disadvantage", ability: r.ability };
    default: return { target: "initiative", op: "advantage" };
  }
}
function fromStatMod(m: StatMod): EffectRow {
  const base = { value: m.value ?? 0, ability: m.ability ?? "dex" };
  if (m.op === "advantage" && m.target === "initiative") return { kind: "adv_init", ...base };
  if (m.op === "advantage" && m.target === "save") return { kind: "adv_save", ...base };
  if (m.op === "disadvantage" && m.target === "save") return { kind: "dis_save", ...base };
  if (m.target === "save") return { kind: m.ability ? "save_one" : "save_all", ...base };
  const map: Record<string, string> = { ac: "ac", speed: "speed", check: "check", initiative: "initiative", attack: "attack", damage: "damage" };
  return { kind: map[m.target] ?? "ac", ...base };
}

export function HomebrewFeatEditor({ initial, onDone, onCancel }: {
  initial: { name: string; data: Record<string, unknown> } | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const d = initial?.data ?? {};
  const ab0 = d["abilityBonus"] as Record<string, number> | undefined;
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState((d["category"] as string) ?? "O");
  const [prerequisite, setPrerequisite] = useState((d["prerequisite"] as string) ?? "");
  const [summary, setSummary] = useState((d["summary"] as string) ?? "");
  const [abKey, setAbKey] = useState(ab0 ? Object.keys(ab0)[0] ?? "" : "");
  const [abVal, setAbVal] = useState(ab0 ? Object.values(ab0)[0] ?? 1 : 1);
  const [skills, setSkills] = useState<string[]>((d["skills"] as string[]) ?? []);
  const [tools, setTools] = useState(((d["tools"] as string[]) ?? []).join(", "));
  const [rows, setRows] = useState<EffectRow[]>(((d["mechanics"] as StatMod[]) ?? []).map(fromStatMod));
  const [usesMax, setUsesMax] = useState((d["uses"] as { max: number } | undefined)?.max ?? 0);
  const [usesRecharge, setUsesRecharge] = useState((d["uses"] as { recharge: string } | undefined)?.recharge ?? "long_rest");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const setRow = (i: number, patch: Partial<EffectRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const toggleSkill = (s: string) => setSkills((c) => c.includes(s) ? c.filter((x) => x !== s) : [...c, s]);

  async function save() {
    if (!name.trim()) { setNote("Ponle un nombre a la dote."); return; }
    setBusy(true); setNote(null);
    try {
      const mechanics = rows.map(toStatMod);
      const toolsArr = tools.split(",").map((s) => s.trim()).filter(Boolean);
      await api.saveHomebrewFeat({
        name: name.trim(), category, prerequisite: prerequisite.trim() || undefined, summary: summary.trim() || undefined,
        mechanics: mechanics.length ? mechanics : undefined,
        abilityBonus: abKey ? { [abKey]: Number(abVal) || 1 } : undefined,
        skills: skills.length ? skills : undefined,
        tools: toolsArr.length ? toolsArr : undefined,
        uses: usesMax > 0 ? { max: Number(usesMax), recharge: usesRecharge } : undefined,
      });
      onDone();
    } catch (e) { setNote("⚠️ " + (e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="panel">
      <div className="library-head"><h2 style={{ margin: 0 }}>{initial ? `Editar dote: ${initial.name}` : "Crear dote homebrew"}</h2><button className="btn small" onClick={onCancel}>Cancelar</button></div>
      {note && <p className="note warn">{note}</p>}
      <div className="form">
        <label className="field"><span>Nombre</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="p.ej. Guardia veloz" /></label>
        <label className="field"><span>Categoría</span><select value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}</select></label>
        <label className="field span2"><span>Prerrequisito (opcional)</span><input value={prerequisite} onChange={(e) => setPrerequisite(e.target.value)} placeholder="p.ej. Destreza 13" /></label>
        <label className="field span2"><span>Descripción</span><textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Qué hace la dote (texto para la hoja)…" /></label>

        <fieldset className="abilities-input span2">
          <legend>Bono a característica (opcional)</legend>
          <div className="row wrap">
            <select value={abKey} onChange={(e) => setAbKey(e.target.value)}><option value="">— ninguno —</option>{ABILS.map((a) => <option key={a.k} value={a.k}>{a.label}</option>)}</select>
            {abKey && <input type="number" min={1} max={5} value={abVal} onChange={(e) => setAbVal(Number(e.target.value))} style={{ maxWidth: 90 }} />}
          </div>
        </fieldset>

        <fieldset className="abilities-input span2">
          <legend>Competencias que otorga (opcional)</legend>
          <div className="chips">
            {ALL_SKILLS.map((s) => <button type="button" key={s} className={`chip${skills.includes(s) ? " removable" : ""}`} onClick={() => toggleSkill(s)}>{skills.includes(s) ? "✓ " : ""}{SKILL_LABEL[s]}</button>)}
          </div>
          <label className="field span2" style={{ marginTop: 8 }}><span>Herramientas (separadas por coma)</span><input value={tools} onChange={(e) => setTools(e.target.value)} placeholder="p.ej. Herramientas de ladrón" /></label>
        </fieldset>

        <fieldset className="abilities-input span2">
          <legend>Efectos en la hoja (bonos, ventaja/desventaja)</legend>
          {rows.map((r, i) => {
            const def = EFFECTS.find((e) => e.key === r.kind);
            return (
              <div key={i} className="row wrap" style={{ marginBottom: 6, alignItems: "center" }}>
                <select value={r.kind} onChange={(e) => setRow(i, { kind: e.target.value })} style={{ flex: 1, minWidth: 200 }}>
                  {EFFECTS.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
                </select>
                {def?.value && <input type="number" value={r.value} onChange={(e) => setRow(i, { value: Number(e.target.value) })} style={{ maxWidth: 80 }} />}
                {def?.ability && <select value={r.ability} onChange={(e) => setRow(i, { ability: e.target.value })} style={{ maxWidth: 150 }}>{ABILS.map((a) => <option key={a.k} value={a.k}>{a.label}</option>)}</select>}
                <button type="button" className="icon-btn" title="Quitar" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>🗑</button>
              </div>
            );
          })}
          <button type="button" className="btn small" onClick={() => setRows((rs) => [...rs, { kind: "ac", value: 1, ability: "dex" }])}>+ Añadir efecto</button>
        </fieldset>

        <fieldset className="abilities-input span2">
          <legend>Recurso: usos por descanso (opcional)</legend>
          <div className="row wrap">
            <label className="field"><span>Usos (0 = ninguno)</span><input type="number" min={0} value={usesMax} onChange={(e) => setUsesMax(Number(e.target.value))} style={{ maxWidth: 90 }} /></label>
            {usesMax > 0 && (
              <label className="field"><span>Se recupera con</span>
                <select value={usesRecharge} onChange={(e) => setUsesRecharge(e.target.value)}>
                  <option value="long_rest">Descanso largo</option><option value="short_rest">Descanso corto</option><option value="dawn">Amanecer</option>
                </select>
              </label>
            )}
          </div>
        </fieldset>

        <div className="span2 form-actions">
          <button className="btn primary" disabled={busy} onClick={save}>{busy ? "Guardando…" : (initial ? "Guardar cambios" : "Crear dote")}</button>
        </div>
      </div>
    </div>
  );
}
