import { type MonAction, type MonsterData } from "../api";
import { type RollProfile } from "./DMView";

const mod = (s: number) => Math.floor((s - 10) / 2);
const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const ABIL: [string, string][] = [["str", "FUE"], ["dex", "DES"], ["con", "CON"], ["int", "INT"], ["wis", "SAB"], ["cha", "CAR"]];
const SAVE_LABEL: Record<string, string> = { str: "FUE", dex: "DES", con: "CON", int: "INT", wis: "SAB", cha: "CAR" };

export function MonsterStatBlock({ name, data, roll, spent, onToggleSpent }: {
  name: string;
  data: MonsterData;
  roll: (label: string, expr: string, profile: RollProfile) => void;
  spent?: string[];               // acciones ya gastadas (recarga/limitadas), en modo encuentro
  onToggleSpent?: (actionName: string) => void;
}) {
  const actionRow = (a: MonAction) => {
    const limited = !!a.recharge && !!onToggleSpent;
    const isSpent = limited && (spent ?? []).includes(a.name);
    return (
      <div key={a.name} className="mon-action">
        <p style={isSpent ? { opacity: .5 } : undefined}><b>{a.name}{a.recharge ? ` (${a.recharge})` : ""}.</b> {a.description}</p>
        {(a.attack || a.save || limited) && (
          <div className="row wrap mon-action-btns">
            {a.attack && <button className="btn small" disabled={isSpent} onClick={() => roll(`${a.name} — ataque`, `1d20${fmt(a.attack!.bonus)}`, "fast")}>🎯 Atacar {fmt(a.attack.bonus)}</button>}
            {a.attack?.damage && <button className="btn small primary" disabled={isSpent} onClick={() => roll(`${a.name} — daño`, a.attack!.damage!, "heavy")}>💥 {a.attack.damage}{a.attack.damageType ? ` ${a.attack.damageType}` : ""}</button>}
            {a.attack?.extraDamage && <button className="btn small" disabled={isSpent} onClick={() => roll(`${a.name} — daño extra`, a.attack!.extraDamage!, "heavy")}>+ {a.attack.extraDamage}</button>}
            {a.save && <span className="chip">🛡️ CD {a.save.dc}{a.save.ability ? ` · salv. ${SAVE_LABEL[a.save.ability] ?? a.save.ability}` : ""}</span>}
            {a.save?.damage && <button className="btn small primary" disabled={isSpent} onClick={() => roll(`${a.name} — daño`, a.save!.damage!, "heavy")}>💥 {a.save.damage}{a.save.damageType ? ` ${a.save.damageType}` : ""}</button>}
            {limited && <button className="btn small alt" onClick={() => onToggleSpent!(a.name)}>{isSpent ? "♻ recargar" : "✓ marcar usado"}</button>}
          </div>
        )}
      </div>
    );
  };

  const section = (title: string, arr: MonAction[]) => arr && arr.length > 0 ? (
    <div className="mon-section"><h3>{title}</h3>{arr.map(actionRow)}</div>
  ) : null;

  return (
    <div className="panel mon-block">
      <h2 style={{ marginBottom: 2 }}>{name}</h2>
      <p className="muted small">{data.size} · {data.creatureType} · CR {data.cr}{data.xp ? ` (${data.xp} XP)` : ""} · Comp. {fmt(data.pb)}</p>

      <div className="mon-top">
        <div><span className="muted small">CA</span> <b>{data.ac}</b>{data.acFrom ? <span className="muted small"> ({data.acFrom})</span> : ""}</div>
        <div><span className="muted small">PG</span> <b>{data.hp?.average}</b>{data.hp?.formula ? <span className="muted small"> ({data.hp.formula})</span> : ""}</div>
        <div><span className="muted small">Velocidad</span> <b>{data.speed}</b></div>
      </div>

      <div className="mon-abilities">
        {ABIL.map(([k, label]) => {
          const sc = data.abilities[k] ?? 10;
          const m = mod(sc);
          const sv = data.saves?.[k];
          return (
            <div key={k} className="mon-abil">
              <span className="muted small">{label}</span>
              <b>{sc}</b>
              <button className="btn tiny" title="Prueba de característica" onClick={() => roll(`${label} (prueba)`, `1d20${fmt(m)}`, "normal")}>{fmt(m)}</button>
              {sv != null && <button className="btn tiny alt" title="Salvación" onClick={() => roll(`Salv. ${label}`, `1d20${fmt(sv)}`, "normal")}>🛡️{fmt(sv)}</button>}
            </div>
          );
        })}
      </div>

      <div className="mon-meta">
        {data.skills && <div><b>Habilidades:</b> {Object.entries(data.skills).map(([s, v]) => `${s} ${fmt(v)}`).join(", ")}</div>}
        {data.resist && <div><b>Resistencias:</b> {data.resist}</div>}
        {data.immune && <div><b>Inmunidad a daño:</b> {data.immune}</div>}
        {data.vulnerable && <div><b>Vulnerabilidades:</b> {data.vulnerable}</div>}
        {data.conditionImmune && <div><b>Inmunidad a condiciones:</b> {data.conditionImmune}</div>}
        {data.senses && <div><b>Sentidos:</b> {data.senses}{data.passivePerception ? `, Percepción pasiva ${data.passivePerception}` : ""}</div>}
        {data.languages && <div><b>Idiomas:</b> {data.languages}</div>}
      </div>

      {section("Rasgos", data.traits)}
      {section("Acciones", data.actions)}
      {section("Acciones adicionales", data.bonusActions)}
      {section("Reacciones", data.reactions)}
      {section("Acciones legendarias", data.legendary)}
    </div>
  );
}
