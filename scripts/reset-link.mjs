// Genera un enlace de recuperación de contraseña DESDE LA TERMINAL.
// Úsalo cuando quien administra la app (el dueño) se queda fuera y no puede entrar para generarlo
// desde la pantalla de Invitaciones. Apunta a la MISMA base que la app (Turso si hay .env, si no local).
//
//   node scripts/reset-link.mjs tu@email.com
//   node scripts/reset-link.mjs tu@email.com https://tu-sitio.vercel.app
//
// La dirección del sitio sale del 2º argumento o de la variable APP_URL; si no la das, el enlace
// se imprime relativo (/?reset=…) y solo tienes que anteponerle la dirección de tu app.
//
// Requiere compilar antes: npm run build

try { process.loadEnvFile(); } catch { /* sin .env: usa el entorno o la base local */ }

const email = process.argv[2];
if (!email) {
  console.error("Falta el email. Uso: node scripts/reset-link.mjs tu@email.com [https://tu-sitio]");
  process.exit(1);
}
const base = (process.argv[3] || process.env["APP_URL"] || "").replace(/\/+$/, "");

const { createResetForEmail } = await import("../dist/domain/password-reset.js");
try {
  const r = await createResetForEmail(email, base);
  console.log("\n✅ Enlace de recuperación (válido 24 h, un solo uso):\n");
  console.log("   " + r.url);
  if (!base) console.log("\n   ↑ Antepón la dirección de tu app, por ejemplo: https://tu-sitio.vercel.app" + r.url);
  console.log("\nÁbrelo en el navegador y elige una contraseña nueva.\n");
  process.exit(0);
} catch (e) {
  console.error("\n⚠️ " + (e?.message ?? e) + "\n");
  process.exit(1);
}
