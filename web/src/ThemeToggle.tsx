import { useState } from "react";
import { applyTheme, getTheme, type AppTheme } from "./theme";

export function ThemeToggle({ className = "btn small" }: { className?: string }) {
  const [t, setT] = useState<AppTheme>(getTheme());
  const toggle = () => {
    const next: AppTheme = t === "dark" ? "light" : "dark";
    applyTheme(next);
    setT(next);
  };
  return (
    <button className={className} onClick={toggle} title="Cambiar entre tema claro y oscuro">
      {t === "dark" ? "☀️ Claro" : "🌙 Oscuro"}
    </button>
  );
}
