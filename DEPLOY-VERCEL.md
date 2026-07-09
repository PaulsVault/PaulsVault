# Desplegar en Vercel + Turso (gratis, sin servidor que administrar)

La app queda 100% serverless: **Vercel** sirve la SPA y la API (función), y **Turso** (libSQL)
guarda los datos por red. Ambos tienen plan gratuito suficiente para uso personal/pequeño.

Ya está preparado en el repo: `api/index.js` (envuelve Express) + `vercel.json` con un rewrite que
manda `/api/*` a esa función, y el store usa `@libsql/client` (Turso en prod, archivo local en dev).

---

## 1. Crear la base de datos en Turso
Con la **web** (turso.tech → "Create Database") o con la **CLI**:
```bash
# instala la CLI (una vez): https://docs.turso.tech/cli/installation
turso auth signup            # o login
turso db create dnd
turso db show dnd --url      # -> TURSO_DATABASE_URL  (libsql://...)
turso db tokens create dnd   # -> TURSO_AUTH_TOKEN
```
Guarda esos dos valores. El esquema (users, characters, content_packs) se crea solo al primer arranque.

## 2. Generar el secreto de sesión
```bash
openssl rand -hex 32          # -> SESSION_SECRET  (o cualquier cadena larga aleatoria)
```

## 3. Conectar el repo en Vercel
1. vercel.com → **Add New → Project** → importa `PaulsVault/PaulsVault` desde GitHub.
2. Vercel leerá `vercel.json` (build `npm run build:all`, salida estática `web/dist`, función en `api/`).
3. En **Environment Variables** añade (para Production y Preview):
   - `TURSO_DATABASE_URL` = el `libsql://…` del paso 1
   - `TURSO_AUTH_TOKEN` = el token del paso 1
   - `SESSION_SECRET` = el del paso 2
   - (`NODE_ENV=production` lo pone Vercel solo → la cookie de sesión queda `secure`)
4. **Deploy**. Al terminar tendrás una URL `https://tu-proyecto.vercel.app` con login.

## 4. Actualizar (independiente)
`git push` a `main` → Vercel redeploya solo. Los datos viven en Turso, no se pierden.

## 5. Backups
- Turso: `turso db shell dnd .dump > backup.sql` (o desde su panel).
- O exporta cada personaje a `.dndchar` desde la propia app.

---

## Notas y posibles ajustes
- **Contenido global**: en esta versión los content packs (SRD + homebrew importado) son
  compartidos por todos los usuarios; los **personajes** sí están aislados por cuenta. La caché de
  packs se refresca por instancia (un homebrew nuevo puede tardar en verse en otra región).
- **Native bindings**: para Turso remoto, `@libsql/client` usa HTTP/WS puro (sin módulos nativos),
  así que instala limpio en Vercel.
- **Repo público (plan Hobby)**: Vercel **bloquea** los deploys de commits con co-autor cuando el
  repo es **privado** (*"deployment blocked… does not support collaboration for private repositories"*).
  Solución: pon el repo **público** (no hay secretos en él; van solo en las variables de entorno de Vercel).
- **Enrutado de `/api`**: función única `api/index.js` + rewrite en `vercel.json`
  (`{ "source": "/api/(.*)", "destination": "/api/index" }`). **Evita los catch-all** `api/[...path].js`
  o `[[...path]]`: en pruebas el catch-all solo matcheaba rutas de un segmento (`/api/health` OK pero
  `/api/auth/me` daba 404).
- **Dev local**: sin variables de Turso, el store usa un archivo local (`~/.dnd-mcp/app.db` o
  `DND_DB`). `npm start` + `cd web && npm run dev` sigue funcionando igual.
