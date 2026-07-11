import { useState } from "react";

// Descripción de rasgo con tipografía consistente. Las muy largas se colapsan con "ver más".
const LIMIT = 240;

export function FeatureDesc({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > LIMIT;
  const shown = open || !long ? text : text.slice(0, LIMIT).replace(/\s+\S*$/, "") + "… ";
  return (
    <p className="feat-desc">
      {shown}
      {long && <button type="button" className="more-btn" onClick={() => setOpen((v) => !v)}>{open ? "ver menos" : "ver más"}</button>}
    </p>
  );
}
