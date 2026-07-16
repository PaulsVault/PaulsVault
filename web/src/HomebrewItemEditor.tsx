import { useState } from "react";
import { api } from "./api";

interface SpellRow { cost: number; name: string }

const ITEM_TYPES: { k: string; label: string }[] = [
  { k: "weapon", label: "Arma" }, { k: "armor", label: "Armadura" }, { k: "shield", label: "Escudo" },
  { k: "wondrous", label: "Accesorio mágico" }, { k: "tool", label: "Herramienta / kit" },
  { k: "consumable", label: "Consumible" }, { k: "gear", label: "Equipo general" }, { k: "ammunition", label: "Munición" },
];
const WEAPON_PROPS = ["finesse", "light", "heavy", "thrown", "versatile", "two-handed", "reach", "ammunition", "loading"];
const DMG_TYPES = ["slashing", "piercing", "bludgeoning", "fire", "cold", "acid", "lightning", "thunder", "poison", "necrotic", "radiant", "force", "psychic"];

export function HomebrewItemEditor({ initial, onDone, onCancel }: {
  initial: { name: string; data: Record<string, unknown> } | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const d = initial?.data ?? {};
  const [name, setName] = useState(initial?.name ?? "");
  const [itemType, setItemType] = useState((d["itemType"] as string) ?? "weapon");
  const [description, setDescription] = useState((d["description"] as string) ?? "");
  const [weight, setWeight] = useState<number | "">((d["weight"] as number) ?? "");
  const [cost, setCost] = useState((d["cost"] as string) ?? "");
  const [rarity, setRarity] = useState((d["rarity"] as string) ?? "");
  const [attune, setAttune] = useState(d["requiresAttunement"] === true);
  // Arma
  const dmgParts = String(d["damage"] ?? "").match(/(\d+d\d+)\s*(\w+)?/);
  const [dmgDice, setDmgDice] = useState(dmgParts?.[1] ?? "");
  const [dmgType, setDmgType] = useState(dmgParts?.[2] ?? "slashing");
  const [weaponCategory, setWeaponCategory] = useState((d["weaponCategory"] as string) ?? "simple");
  const [props, setProps] = useState<string[]>((d["properties"] as string[]) ?? []);
  const [magicBonus, setMagicBonus] = useState<number | "">((d["magicBonus"] as number) ?? "");
  // Armadura / escudo
  const [armorClass, setArmorClass] = useState<number | "">((d["armorClass"] as number) ?? "");
  const [armorCat, setArmorCat] = useState((d["armorCategory"] as string) ?? "light");
  // Bonos pasivos a la hoja
  const [bonusAc, setBonusAc] = useState<number | "">((d["bonusAc"] as number) ?? "");
  const [bonusSave, setBonusSave] = useState<number | "">((d["bonusSave"] as number) ?? "");
  const [bonusSpellAttack, setBonusSpellAttack] = useState<number | "">((d["bonusSpellAttack"] as number) ?? "");
  const [bonusSpellDc, setBonusSpellDc] = useState<number | "">((d["bonusSpellDc"] as number) ?? "");
  // Cargas y conjuros
  const [charges, setCharges] = useState<number | "">((d["charges"] as number) ?? "");
  const [recharge, setRecharge] = useState((d["recharge"] as string) ?? "dawn");
  const [rechargeAmount, setRechargeAmount] = useState((d["rechargeAmount"] as string) ?? "");
  const [spells, setSpells] = useState<SpellRow[]>((d["spells"] as SpellRow[]) ?? []);

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const isWeapon = itemType === "weapon";
  const isArmor = itemType === "armor";
  const isShield = itemType === "shield";
  const toggleProp = (p: string) => setProps((c) => c.includes(p) ? c.filter((x) => x !== p) : [...c, p]);

  async function save() {
    if (!name.trim()) { setNote("Ponle un nombre al objeto."); return; }
    setBusy(true); setNote(null);
    try {
      await api.saveHomebrewItem({
        name: name.trim(), itemType, description: description.trim() || undefined,
        weight: weight === "" ? undefined : weight, cost: cost.trim() || undefined, rarity: rarity.trim() || undefined,
        requiresAttunement: attune,
        damage: isWeapon && dmgDice.trim() ? `${dmgDice.trim()} ${dmgType}` : undefined,
        weaponCategory: isWeapon ? weaponCategory : undefined,
        properties: isWeapon && props.length ? props : undefined,
        magicBonus: (isWeapon || isArmor || isShield) && magicBonus !== "" ? magicBonus : undefined,
        armorClass: isArmor || isShield ? (armorClass === "" ? undefined : armorClass) : undefined,
        armorCategory: isArmor ? armorCat : isShield ? "shield" : undefined,
        bonusAc: bonusAc === "" ? undefined : bonusAc,
        bonusSave: bonusSave === "" ? undefined : bonusSave,
        bonusSpellAttack: bonusSpellAttack === "" ? undefined : bonusSpellAttack,
        bonusSpellDc: bonusSpellDc === "" ? undefined : bonusSpellDc,
        charges: charges === "" ? undefined : charges,
        recharge: charges !== "" ? recharge : undefined,
        rechargeAmount: charges !== "" && rechargeAmount.trim() ? rechargeAmount.trim() : undefined,
        spells: spells.filter((s) => s.name.trim()).length ? spells.filter((s) => s.name.trim()) : undefined,
      });
      onDone();
    } catch (e) { setNote("⚠️ " + (e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="panel">
      <div className="library-head"><h2 style={{ margin: 0 }}>{initial ? `Editar objeto: ${initial.name}` : "Crear equipo homebrew"}</h2><button className="btn small" onClick={onCancel}>Cancelar</button></div>
      {note && <p className="note warn">{note}</p>}
      <div className="form">
        <label className="field"><span>Nombre</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="p.ej. Espada del alba" /></label>
        <label className="field"><span>Tipo</span><select value={itemType} onChange={(e) => setItemType(e.target.value)}>{ITEM_TYPES.map((t) => <option key={t.k} value={t.k}>{t.label}</option>)}</select></label>
        <label className="field"><span>Peso (lb)</span><input type="number" min={0} value={weight} onChange={(e) => setWeight(e.target.value === "" ? "" : Number(e.target.value))} /></label>
        <label className="field"><span>Coste (texto)</span><input value={cost} onChange={(e) => setCost(e.target.value)} placeholder="p.ej. 500 gp" /></label>
        <label className="field"><span>Rareza</span><input value={rarity} onChange={(e) => setRarity(e.target.value)} placeholder="p.ej. rare" /></label>
        <label className="field inline"><input type="checkbox" checked={attune} onChange={(e) => setAttune(e.target.checked)} /> Requiere sintonización</label>
        <label className="field span2"><span>Descripción (si incluye daño+salvación, se puede "Usar" como efecto)</span><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Qué hace el objeto…" /></label>

        {isWeapon && (
          <fieldset className="abilities-input span2">
            <legend>Arma</legend>
            <div className="row wrap">
              <label className="field"><span>Daño (dados)</span><input value={dmgDice} onChange={(e) => setDmgDice(e.target.value)} placeholder="1d8" /></label>
              <label className="field"><span>Tipo de daño</span><select value={dmgType} onChange={(e) => setDmgType(e.target.value)}>{DMG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
              <label className="field"><span>Categoría</span><select value={weaponCategory} onChange={(e) => setWeaponCategory(e.target.value)}><option value="simple">Simple</option><option value="martial">Marcial</option></select></label>
              <label className="field"><span>Bono mágico</span><input type="number" min={0} max={3} value={magicBonus} onChange={(e) => setMagicBonus(e.target.value === "" ? "" : Number(e.target.value))} /></label>
            </div>
            <p className="muted small" style={{ margin: "6px 0 2px" }}>Propiedades:</p>
            <div className="chips">{WEAPON_PROPS.map((p) => <button type="button" key={p} className={`chip${props.includes(p) ? " removable" : ""}`} onClick={() => toggleProp(p)}>{props.includes(p) ? "✓ " : ""}{p}</button>)}</div>
          </fieldset>
        )}

        {(isArmor || isShield) && (
          <fieldset className="abilities-input span2">
            <legend>{isShield ? "Escudo" : "Armadura"}</legend>
            <div className="row wrap">
              <label className="field"><span>{isShield ? "Bono de CA (p.ej. 2)" : "CA base (p.ej. 14)"}</span><input type="number" min={0} value={armorClass} onChange={(e) => setArmorClass(e.target.value === "" ? "" : Number(e.target.value))} /></label>
              {isArmor && <label className="field"><span>Categoría</span><select value={armorCat} onChange={(e) => setArmorCat(e.target.value)}><option value="light">Ligera</option><option value="medium">Media</option><option value="heavy">Pesada</option></select></label>}
              <label className="field"><span>Bono mágico (+CA)</span><input type="number" min={0} max={3} value={magicBonus} onChange={(e) => setMagicBonus(e.target.value === "" ? "" : Number(e.target.value))} /></label>
            </div>
          </fieldset>
        )}

        <fieldset className="abilities-input span2">
          <legend>Bonos pasivos a la hoja (mientras esté equipado/sintonizado)</legend>
          <div className="row wrap">
            <label className="field"><span>+CA (accesorio no-armadura)</span><input type="number" value={bonusAc} onChange={(e) => setBonusAc(e.target.value === "" ? "" : Number(e.target.value))} /></label>
            <label className="field"><span>+a salvaciones</span><input type="number" value={bonusSave} onChange={(e) => setBonusSave(e.target.value === "" ? "" : Number(e.target.value))} /></label>
            <label className="field"><span>+ataque de conjuro</span><input type="number" value={bonusSpellAttack} onChange={(e) => setBonusSpellAttack(e.target.value === "" ? "" : Number(e.target.value))} /></label>
            <label className="field"><span>+CD de conjuro</span><input type="number" value={bonusSpellDc} onChange={(e) => setBonusSpellDc(e.target.value === "" ? "" : Number(e.target.value))} /></label>
          </div>
        </fieldset>

        <fieldset className="abilities-input span2">
          <legend>Cargas y conjuros (objetos tipo bastón/varita)</legend>
          <div className="row wrap">
            <label className="field"><span>Cargas máximas (0 = sin cargas)</span><input type="number" min={0} value={charges} onChange={(e) => setCharges(e.target.value === "" ? "" : Number(e.target.value))} /></label>
            {charges !== "" && charges > 0 && (
              <>
                <label className="field"><span>Recarga</span><select value={recharge} onChange={(e) => setRecharge(e.target.value)}><option value="dawn">Al amanecer</option><option value="long_rest">Descanso largo</option><option value="short_rest">Descanso corto</option></select></label>
                <label className="field"><span>Cantidad recargada (p.ej. 1d6+4)</span><input value={rechargeAmount} onChange={(e) => setRechargeAmount(e.target.value)} /></label>
              </>
            )}
          </div>
          {charges !== "" && charges > 0 && (
            <>
              <p className="muted small" style={{ margin: "8px 0 2px" }}>Conjuros que lanza (con su coste en cargas):</p>
              {spells.map((sp, i) => (
                <div key={i} className="row wrap" style={{ marginBottom: 6, alignItems: "center" }}>
                  <input placeholder="Nombre del conjuro" value={sp.name} onChange={(e) => setSpells((s) => s.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} style={{ flex: 1, minWidth: 160 }} />
                  <input type="number" min={1} placeholder="coste" value={sp.cost} onChange={(e) => setSpells((s) => s.map((x, j) => j === i ? { ...x, cost: Number(e.target.value) } : x))} style={{ maxWidth: 90 }} />
                  <button type="button" className="icon-btn" title="Quitar" onClick={() => setSpells((s) => s.filter((_, j) => j !== i))}>🗑</button>
                </div>
              ))}
              <button type="button" className="btn small" onClick={() => setSpells((s) => [...s, { cost: 1, name: "" }])}>+ Añadir conjuro</button>
            </>
          )}
        </fieldset>

        <div className="span2 form-actions">
          <button className="btn primary" disabled={busy} onClick={save}>{busy ? "Guardando…" : (initial ? "Guardar cambios" : "Crear objeto")}</button>
        </div>
      </div>
    </div>
  );
}
