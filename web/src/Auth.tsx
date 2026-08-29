import { useEffect, useState } from "react";
import { api, type AuthUser } from "./api";
import { DragonArt } from "./DragonArt";
import { ThemeToggle } from "./ThemeToggle";

type Mode = "login" | "register" | "forgot" | "reset";

export function Auth({ onAuthed }: { onAuthed: (u: AuthUser) => void }) {
  const params = new URLSearchParams(window.location.search);
  const urlInvite = params.get("invite") ?? "";
  const urlReset = params.get("reset") ?? "";
  const [mode, setMode] = useState<Mode>(urlReset ? "reset" : urlInvite ? "register" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [invite, setInvite] = useState(urlInvite);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);
  const [resetEmail, setResetEmail] = useState<string | null>(null);
  const [resetChecking, setResetChecking] = useState(urlReset !== "");

  // Al abrir un enlace de recuperación, comprobamos que siga siendo válido y de quién es.
  useEffect(() => {
    if (!urlReset) return;
    api.resetInfo(urlReset)
      .then((r) => setResetEmail(r.email))
      .catch((e) => setError((e as Error).message))
      .finally(() => setResetChecking(false));
  }, [urlReset]);

  function goMode(m: Mode) { setMode(m); setError(null); setPassword(""); setPassword2(""); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      if (mode === "reset") {
        if (password !== password2) throw new Error("Las contraseñas no coinciden.");
        const { user } = await api.resetPassword(urlReset, password);
        window.history.replaceState({}, "", window.location.pathname); // limpia el ?reset de la URL
        onAuthed(user);
        return;
      }
      const { user } = mode === "login"
        ? await api.login(email, password)
        : await api.register(email, password, invite.trim());
      onAuthed(user);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const tagline =
    mode === "reset" ? "Elige una contraseña nueva"
    : mode === "forgot" ? "¿Olvidaste tu contraseña?"
    : mode === "login" ? "Inicia sesión para ver tus personajes"
    : "Registro solo por invitación — crea tu cuenta";

  return (
    <div className="auth-wrap">
      <div className="auth-theme-toggle"><ThemeToggle /></div>
      <div className="auth-card">
        {imgFailed ? <DragonArt /> : (
          <div className="dragon-scene">
            <img className="dragon-img" src="/bahamut.png" alt="Dragón platino" onError={() => setImgFailed(true)} />
          </div>
        )}
        <h1 className="auth-brand">⚔️ D&amp;D 2024</h1>
        <p className="auth-tagline">{tagline}</p>

        {mode === "forgot" ? (
          <div className="stack">
            <p className="muted small" style={{ lineHeight: 1.5 }}>
              La recuperación es por <b>enlace</b>. Escríbele a quien administra la app (quien te invitó)
              y pídele un <b>enlace de recuperación</b>. Cuando lo abras, podrás crear una contraseña nueva.
            </p>
            <button className="link-btn" onClick={() => goMode("login")}>← Volver a iniciar sesión</button>
          </div>
        ) : mode === "reset" ? (
          resetChecking ? <p className="muted">Comprobando el enlace…</p>
          : resetEmail == null ? (
            <div className="stack">
              {error && <p className="error">⚠️ {error}</p>}
              <p className="muted small">Pide un enlace nuevo a quien administra la app.</p>
              <button className="link-btn" onClick={() => { window.history.replaceState({}, "", window.location.pathname); goMode("login"); }}>← Ir a iniciar sesión</button>
            </div>
          ) : (
            <form className="stack" onSubmit={submit}>
              <p className="muted small">Cuenta: <b>{resetEmail}</b></p>
              <label className="field"><span>Nueva contraseña <em className="muted small">(mín. 8)</em></span>
                <input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </label>
              <label className="field"><span>Repite la contraseña</span>
                <input type="password" autoComplete="new-password" required minLength={8} value={password2} onChange={(e) => setPassword2(e.target.value)} placeholder="••••••••" />
              </label>
              {error && <p className="error">⚠️ {error}</p>}
              <button className="btn primary" type="submit" disabled={busy || password.length < 8 || password !== password2}>
                {busy ? "…" : "Guardar contraseña"}
              </button>
            </form>
          )
        ) : (
          <>
            <form className="stack" onSubmit={submit}>
              <label className="field"><span>Email</span>
                <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" />
              </label>
              <label className="field"><span>Contraseña {mode === "register" && <em className="muted small">(mín. 8)</em>}</span>
                <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </label>
              {mode === "register" && (
                <label className="field"><span>Código de invitación</span>
                  <input value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="Abre tu enlace de invitación o pega el código" required />
                </label>
              )}
              {error && <p className="error">⚠️ {error}</p>}
              <button className="btn primary" type="submit" disabled={busy || !email || password.length < 8 || (mode === "register" && !invite.trim())}>
                {busy ? "…" : mode === "login" ? "Entrar" : "Crear cuenta"}
              </button>
            </form>
            {mode === "login" && (
              <button className="link-btn" onClick={() => goMode("forgot")}>¿Olvidaste tu contraseña?</button>
            )}
            <button className="link-btn" onClick={() => goMode(mode === "login" ? "register" : "login")}>
              {mode === "login" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
