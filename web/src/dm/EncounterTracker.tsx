import { useEffect, useMemo, useState } from "react";
import { api, type Combatant, type Encounter, type MonsterCard, type MonsterData } from "../api";
import { MonsterStatBlock } from "./MonsterStatBlock";
import type { RollFn } from "./DMView";
import type { CharacterSummary } from "../types";

const d20 = () => Math.floor(Math.random() * 20) + 1;
const abilityMod = (s: number) => Math.floor((s - 10) / 2);
const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const initVal = (c: Combatant) => (c.initiative == null ? -Infinity : c.initiative);
const CONDITIONS = ["Cegado", "Aturdido", "Derribado", "Apresado", "Asustado", "Envenenado", "Paralizado", "Petrificado", "Aturdido", "Inconsciente", "Restringido", "Hechizado", "Ensordecido", "Incapacitado", "Invisible", "Concentración"];
const KIND_LABEL: Record<string, string> = { monster: "👹", player: "🛡️", npc: "🧑" };

export function EncounterTracker({ roll }: { roll: RollFn }) {
  const [list, setList] = useState<Encounter[]>([]);
  const [enc, setEnc] = useState<Encounter | null>(null);
  const [statblocks, setStatblocks] = useState<Record<string, MonsterData>>({});
  const [chars, setChars] = useState<CharacterSummary[]>([]);
  const [monsters, setMonsters] = useState<MonsterCard[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    void api.encounters().then((es) => { setList(es); if (es[0]) selectEnc(es[0]); }).catch(() => {});
    void api.listCharacters().then(setChars).catch(() => {});
    void api.monsters().then(setMonsters).catch(() => {});
  }, []);

  function selectEnc(e: Encounter) {
    setEnc(e);
    const refs = [...new Set(e.combatants.filter((c) => c.kind === "monster" && c.ref).map((c) => c.ref!))];
    for (const r of refs) if (!statblocks[r]) void api.monster(r).then((d) => setStatblocks((s) => ({ ...s, [r]: d }))).catch(() => {});
  }

  function save(e: Encounter) {
    void api.saveEncounter(e.id, e).then((saved) => setList((l) => l.map((x) => (x.id === saved.id ? saved : x)))).catch((err) => setNote("⚠️ " + (err as Error).message));
  }
  function mutate(fn: (e: Encounter) => void) {
    if (!enc) return;
    const next = structuredClone(enc);
    fn(next);
    setEnc(next); save(next);
  }
  const patchC = (id: string, fn: (c: Combatant) => void) => mutate((e) => { const c = e.combatants.find((x) => x.id === id); if (c) fn(c); });

  // ─── Encuentros ───
  async function createEnc() {
    const e = await api.createEncounter("Encuentro " + (list.length + 1));
    setList((l) => [e, ...l]); selectEnc(e);
  }
  async function deleteEnc(id: string) {
    if (!confirm("¿Borrar este encuentro?")) return;
    await api.deleteEncounter(id);
    const rest = list.filter((x) => x.id !== id);
    setList(rest); setEnc(rest[0] ?? null); if (rest[0]) selectEnc(rest[0]);
  }

  // ─── Combatientes ───
  async function addMonster(name: string, count: number) {
    if (!enc) return;
    const e = await api.addMonsterToEnc(enc.id, name, count);
    setEnc(e); setList((l) => l.map((x) => (x.id === e.id ? e : x))); selectEnc(e);
  }
  async function addPlayer(cid: string) {
    if (!enc) return;
    const e = await api.addPlayerToEnc(enc.id, cid);
    setEnc(e); setList((l) => l.map((x) => (x.id === e.id ? e : x)));
  }
  async function addNpc(name: string, ac: number, hp: number, initiative: number | null) {
    if (!enc) return;
    const e = await api.addNpcToEnc(enc.id, { name, ac, hp, initiative });
    setEnc(e); setList((l) => l.map((x) => (x.id === e.id ? e : x)));
  }

  // ─── Iniciativa / turnos ───
  const sortInit = () => mutate((e) => { e.combatants.sort((a, b) => initVal(b) - initVal(a)); e.turnIndex = 0; });
  const rollInitiative = () => mutate((e) => {
    for (const c of e.combatants) c.initiative = d20() + (c.initiativeBonus ?? 0);
    e.combatants.sort((a, b) => initVal(b) - initVal(a)); e.turnIndex = 0; e.round = 1;
  });
  const nextTurn = () => mutate((e) => {
    if (e.combatants.length === 0) return;
    e.turnIndex += 1;
    if (e.turnIndex >= e.combatants.length) { e.turnIndex = 0; e.round += 1; }
  });

  // ─── PG ───
  const applyDamage = (c: Combatant, n: number) => { let dmg = n; if (c.hp.temp > 0) { const a = Math.min(c.hp.temp, dmg); c.hp.temp -= a; dmg -= a; } c.hp.current = Math.max(0, c.hp.current - dmg); };

  if (!enc) {
    return (
      <div className="stack">
        {note && <p className="note warn">{note}</p>}
        <div className="panel">
          <h2>Encuentros</h2>
          <p className="muted small">Crea un encuentro para trackear iniciativa, PG y usar los stat blocks en combate.</p>
          <button className="btn primary" onClick={createEnc}>+ Nuevo encuentro</button>
          {list.length > 0 && <ul className="line-list" style={{ marginTop: 8 }}>{list.map((e) => <li key={e.id} className="clickable" onClick={() => selectEnc(e)}><span><b>{e.name}</b> <span className="muted small">· {e.combatants.length} combatientes</span></span></li>)}</ul>}
        </div>
      </div>
    );
  }

  const ordered = enc.combatants;
  return (
    <div className="stack">
      {note && <p className="note warn">{note}</p>}

      <div className="panel enc-head">
        <div className="row wrap" style={{ alignItems: "center" }}>
          <select value={enc.id} onChange={(e) => { const s = list.find((x) => x.id === e.target.value); if (s) selectEnc(s); }}>
            {list.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <button className="btn small" onClick={createEnc}>+ Nuevo</button>
          <input value={enc.name} onChange={(e) => mutate((x) => { x.name = e.target.value; })} style={{ maxWidth: 200 }} />
          <span className="spacer" />
          <button className="icon-btn" title="Borrar encuentro" onClick={() => deleteEnc(enc.id)}>🗑</button>
        </div>
        <div className="row wrap" style={{ alignItems: "center", marginTop: 8 }}>
          <span className="chip">Ronda {enc.round}</span>
          <button className="btn small primary" onClick={nextTurn}>⏭ Siguiente turno</button>
          <button className="btn small" onClick={rollInitiative}>🎲 Tirar iniciativa (todos)</button>
          <button className="btn small" onClick={sortInit}>↕ Ordenar por iniciativa</button>
        </div>
      </div>

      <AddBar chars={chars} monsters={monsters} onMonster={addMonster} onPlayer={addPlayer} onNpc={addNpc} />
      <BulkSave combatants={ordered} statblocks={statblocks} />

      <div className="stack enc-list">
        {ordered.map((c, i) => (
          <CombatantRow key={c.id} c={c} current={i === enc.turnIndex} statblock={c.ref ? statblocks[c.ref] : undefined}
            roll={roll} expanded={expanded.has(c.id)}
            onToggleExpand={() => setExpanded((s) => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}
            onInit={(v) => patchC(c.id, (x) => { x.initiative = v; })}
            onDamage={(n) => patchC(c.id, (x) => applyDamage(x, n))}
            onHeal={(n) => patchC(c.id, (x) => { x.hp.current = Math.min(x.hp.max, x.hp.current + n); })}
            onTemp={(n) => patchC(c.id, (x) => { x.hp.temp = Math.max(0, n); })}
            onCondition={(cond) => patchC(c.id, (x) => { x.conditions = x.conditions.includes(cond) ? x.conditions.filter((y) => y !== cond) : [...x.conditions, cond]; })}
            onToggleSpent={(a) => patchC(c.id, (x) => { x.spent = x.spent.includes(a) ? x.spent.filter((y) => y !== a) : [...x.spent, a]; })}
            onRemove={() => mutate((e) => { e.combatants = e.combatants.filter((x) => x.id !== c.id); if (e.turnIndex >= e.combatants.length) e.turnIndex = 0; })}
          />
        ))}
        {ordered.length === 0 && <p className="muted small">Añade combatientes con la barra de arriba.</p>}
      </div>
    </div>
  );
}

// ─── Fila de combatiente ───
function CombatantRow({ c, current, statblock, roll, expanded, onToggleExpand, onInit, onDamage, onHeal, onTemp, onCondition, onToggleSpent, onRemove }: {
  c: Combatant; current: boolean; statblock?: MonsterData; roll: RollFn; expanded: boolean;
  onToggleExpand: () => void; onInit: (v: number) => void; onDamage: (n: number) => void; onHeal: (n: number) => void;
  onTemp: (n: number) => void; onCondition: (c: string) => void; onToggleSpent: (a: string) => void; onRemove: () => void;
}) {
  const [amt, setAmt] = useState(0);
  const [condOpen, setCondOpen] = useState(false);
  const dead = c.hp.current <= 0;
  return (
    <div className={`panel cbt-row${current ? " cbt-current" : ""}${dead ? " cbt-dead" : ""}`}>
      <div className="cbt-main">
        <span className="cbt-turn">{current ? "▶" : ""}</span>
        <input className="cbt-init" type="number" value={c.initiative ?? ""} onChange={(e) => onInit(Number(e.target.value))} title="Iniciativa" />
        <span className="cbt-name">{KIND_LABEL[c.kind]} <b>{c.name}</b> <span className="muted small">CA {c.ac}</span></span>
        <span className="cbt-hp">
          <b className={dead ? "hp-zero" : ""}>{c.hp.current}</b>/<span>{c.hp.max}</span>{c.hp.temp > 0 && <span className="hp-temp"> +{c.hp.temp}</span>}
        </span>
        {c.kind === "monster" && statblock && <button className="btn small" onClick={onToggleExpand}>{expanded ? "▲" : "▼ acciones"}</button>}
        <button className="icon-btn" title="Quitar" onClick={onRemove}>🗑</button>
      </div>
      <div className="cbt-controls row wrap">
        <input type="number" value={amt} onChange={(e) => setAmt(Number(e.target.value))} style={{ maxWidth: 70 }} />
        <button className="btn tiny" onClick={() => { if (amt) onDamage(amt); }}>💔 Daño</button>
        <button className="btn tiny alt" onClick={() => { if (amt) onHeal(amt); }}>💚 Curar</button>
        <button className="btn tiny alt" onClick={() => onTemp(amt)}>🛡 Temp</button>
        <button className="btn tiny alt" onClick={() => setCondOpen((v) => !v)}>+ Condición</button>
        {c.conditions.map((cond) => <span key={cond} className="chip removable" onClick={() => onCondition(cond)}>{cond} ✕</span>)}
      </div>
      {condOpen && <div className="chips" style={{ marginTop: 4 }}>{[...new Set(CONDITIONS)].map((cond) => <button key={cond} type="button" className={`chip${c.conditions.includes(cond) ? " removable" : ""}`} onClick={() => onCondition(cond)}>{cond}</button>)}</div>}
      {expanded && statblock && (
        <div className="cbt-statblock">
          <MonsterStatBlock name={c.name} data={statblock} roll={roll} spent={c.spent} onToggleSpent={onToggleSpent} />
        </div>
      )}
    </div>
  );
}

// ─── Barra de añadir combatientes ───
function AddBar({ chars, monsters, onMonster, onPlayer, onNpc }: {
  chars: CharacterSummary[]; monsters: MonsterCard[];
  onMonster: (name: string, count: number) => void; onPlayer: (id: string) => void; onNpc: (name: string, ac: number, hp: number, init: number | null) => void;
}) {
  const [mq, setMq] = useState(""); const [count, setCount] = useState(1);
  const [npc, setNpc] = useState({ name: "", ac: 12, hp: 10 });
  const matches = useMemo(() => { const q = mq.trim().toLowerCase(); return q.length < 2 ? [] : monsters.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 8); }, [mq, monsters]);
  return (
    <div className="panel">
      <h2>Añadir combatientes</h2>
      <div className="row wrap" style={{ alignItems: "center" }}>
        <input placeholder="Buscar monstruo…" value={mq} onChange={(e) => setMq(e.target.value)} style={{ minWidth: 160 }} />
        <label className="muted small">×<input type="number" min={1} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} style={{ maxWidth: 60 }} /></label>
      </div>
      {matches.length > 0 && <ul className="line-list" style={{ marginTop: 6 }}>{matches.map((m) => <li key={m.name}><span><b>{m.name}</b> <span className="muted small">CR {m.cr} · PG {m.hp}</span></span><button className="btn small primary" onClick={() => { onMonster(m.name, count); setMq(""); }}>+ Añadir</button></li>)}</ul>}
      <div className="row wrap" style={{ marginTop: 10, alignItems: "center" }}>
        <span className="muted small">Jugador:</span>
        <select onChange={(e) => { if (e.target.value) { onPlayer(e.target.value); e.target.value = ""; } }} defaultValue="">
          <option value="">— elige personaje —</option>
          {chars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="row wrap" style={{ marginTop: 10, alignItems: "center" }}>
        <span className="muted small">NPC manual:</span>
        <input placeholder="Nombre" value={npc.name} onChange={(e) => setNpc({ ...npc, name: e.target.value })} style={{ maxWidth: 140 }} />
        <label className="muted small">CA<input type="number" value={npc.ac} onChange={(e) => setNpc({ ...npc, ac: Number(e.target.value) })} style={{ maxWidth: 60 }} /></label>
        <label className="muted small">PG<input type="number" value={npc.hp} onChange={(e) => setNpc({ ...npc, hp: Number(e.target.value) })} style={{ maxWidth: 70 }} /></label>
        <button className="btn small" disabled={!npc.name.trim()} onClick={() => { onNpc(npc.name, npc.ac, npc.hp, null); setNpc({ name: "", ac: 12, hp: 10 }); }}>+ Añadir</button>
      </div>
    </div>
  );
}

// ─── Salvaciones en grupo (ataque de área) ───
function BulkSave({ combatants, statblocks }: { combatants: Combatant[]; statblocks: Record<string, MonsterData> }) {
  const [open, setOpen] = useState(false);
  const [ability, setAbility] = useState("dex");
  const [dc, setDc] = useState(13);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<{ name: string; roll: number; total: number; pass: boolean }[] | null>(null);
  const mons = combatants.filter((c) => c.kind === "monster" && c.ref && statblocks[c.ref]);

  const saveMod = (c: Combatant) => { const sb = statblocks[c.ref!]; return sb.saves?.[ability] ?? abilityMod(sb.abilities[ability] ?? 10); };
  function rollAll() {
    const res = mons.filter((c) => sel.has(c.id)).map((c) => { const r = d20(); const total = r + saveMod(c); return { name: c.name, roll: r, total, pass: total >= dc }; });
    setResults(res);
  }
  return (
    <div className="panel">
      <div className="collapse-h" onClick={() => setOpen(!open)}><h2 style={{ margin: 0 }}>🛡️ Salvaciones en grupo (ataque de área)</h2><span className="muted">{open ? "▲" : "▼"}</span></div>
      {open && (
        <>
          <p className="muted small">Marca los monstruos afectados, elige la característica y la CD, y tira todas las salvaciones de una vez.</p>
          <div className="row wrap" style={{ alignItems: "center" }}>
            <select value={ability} onChange={(e) => setAbility(e.target.value)}>{["str", "dex", "con", "int", "wis", "cha"].map((a) => <option key={a} value={a}>{a.toUpperCase()}</option>)}</select>
            <label className="muted small">CD<input type="number" value={dc} onChange={(e) => setDc(Number(e.target.value))} style={{ maxWidth: 70 }} /></label>
            <button className="btn small primary" disabled={sel.size === 0} onClick={rollAll}>🎲 Tirar {sel.size} salvaciones</button>
            <button className="btn small alt" onClick={() => setSel(new Set(mons.map((c) => c.id)))}>Todos</button>
            <button className="btn small alt" onClick={() => setSel(new Set())}>Ninguno</button>
          </div>
          <div className="chips" style={{ marginTop: 6 }}>
            {mons.map((c) => <button key={c.id} type="button" className={`chip${sel.has(c.id) ? " removable" : ""}`} onClick={() => setSel((s) => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}>{sel.has(c.id) ? "✓ " : ""}{c.name} ({fmt(saveMod(c))})</button>)}
            {mons.length === 0 && <span className="muted small">No hay monstruos con stat block en el encuentro.</span>}
          </div>
          {results && (
            <ul className="line-list" style={{ marginTop: 8 }}>
              {results.map((r, i) => <li key={i} className={r.pass ? "" : "cbt-dead"}><span>{r.name}: 🎲{r.roll} → <b>{r.total}</b> vs CD {dc}</span><span className={r.pass ? "tag good" : "tag bad"}>{r.pass ? "✅ salva" : "❌ falla"}</span></li>)}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
