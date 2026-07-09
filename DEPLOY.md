# Despliegue e independencia

Guía para alojar la app y mantenerla **sin depender de Claude**. Decisiones tomadas:
alcance **público / muchos usuarios**, hosting **nube gestionada (PaaS)**, datos **SQLite** (vía libSQL/Turso).

## 0. Propiedad del código (independencia real)

El proyecto es un stack estándar (Node + Express + React + TypeScript) con tests y build por `npm`.
No hay ninguna dependencia de Claude en tiempo de ejecución. El primer paso para poder mantenerlo y
actualizarlo por tu cuenta es tener el código en **tu** repositorio:

```bash
# ya está hecho el `git init` (rama main). Cuando tengas el repo en GitHub:
git add -A
git commit -m "Estado inicial: dominio + API + SPA + PWA"
git remote add origin https://github.com/<tu-usuario>/<tu-repo>.git
git push -u origin main
```

A partir de ahí, cualquier cambio = commit + push, y el PaaS redespliega solo.

## 1. Build y ejecución

- `npm run build:all` — compila backend (`dist/`) **y** frontend (`web/dist/`).
- `npm start` — arranca el servidor (sirve API en `/api` y la SPA). `PORT` configurable (default 3000).
- Datos en `DND_DATA_DIR` (hoy: archivos JSON; ver §3 para SQLite).

## 2. Hosting en PaaS

Cualquiera de estos despliega desde GitHub y da una URL pública con poco mantenimiento:

- **Render / Railway / Fly.io**: build command `npm ci && npm run build:all`, start command `npm start`.
- Necesitan un **disco persistente** (o Turso, §3) porque el sistema de archivos del contenedor es efímero.
- Variables de entorno:
  - `PORT` — lo pone el PaaS.
  - `DND_DB` (ruta del `app.db` en el disco persistente, p. ej. `/data/app.db`) o `DND_DATA_DIR`.
  - `SESSION_SECRET` — **obligatorio en prod**: cadena larga aleatoria para firmar las sesiones. Sin ella, se genera una al azar y las sesiones se invalidan en cada reinicio.
  - `NODE_ENV=production` — activa la cookie `secure` (solo HTTPS).

Se incluirá un `Dockerfile` para un despliegue reproducible en cualquier PaaS con contenedores.

## 3. Base de datos: SQLite (`node:sqlite`) — ✅ implementado

`src/store.ts` ya usa **`node:sqlite`**, el módulo SQLite **síncrono integrado en Node 24**
(sin dependencias npm ni módulos nativos que compilar). Toda la persistencia vive solo en ese
archivo; el dominio y la API no cambiaron.

- **Ubicación de la base**: `DND_DB` (ruta completa) o `DND_DATA_DIR/app.db` (default `~/.dnd-mcp/app.db`). WAL activado.
- **Esquema**: `characters (id, owner_id, data, updated_at)` y `content_packs (id, owner_id, data)`.
  `owner_id` ya existe (NULL = global, p. ej. SRD) para el multi-tenant de §4.
- **En PaaS**: monta un **disco persistente** y apunta `DND_DB` a él (p. ej. `/data/app.db`). El FS
  del contenedor es efímero; el disco persistente conserva la base entre despliegues.
- **Backup**: copiar `app.db` (+ `-wal`/`-shm`) o exportar personajes a `.dndchar` desde la UI.
- **Escala mayor / edge (futuro)**: si algún día se necesita SQLite replicado (Turso/libSQL),
  se cambia el driver a `@libsql/client`; eso volvería el store asíncrono (refactor acotado a store.ts + capa API).

## 4. Multiusuario y autenticación (requerido para "público")

Hoy la app es mono-inquilino (todos los personajes en una base, sin cuentas). Para abrirla al público:

- Tabla `users` + login; cada personaje/pack lleva `owner_id`; la API filtra por el usuario autenticado.
- Middleware de sesión (cookie httpOnly o JWT) y protección básica (rate limiting, CORS).
- **Decisión tomada: auth propia** (email + contraseña, self-contained, sin SaaS externo).
  Plan: tabla `users` en SQLite, hash de contraseña con **argon2** (o `scrypt` de `node:crypto`,
  sin dependencias), sesión por **JWT en cookie httpOnly**, middleware que exige usuario en las rutas
  y filtra por `owner_id`. Registro/login/logout + rate limiting básico.

## 5. Actualización de contenido (ya independiente)

El contenido del juego entra por **content packs** (biblioteca ilimitada, importable desde la pestaña
*Contenido* de la app o por API). Material nuevo (homebrew, futuras publicaciones) = importar un pack,
sin tocar código. Solo se redistribuye el SRD 5.2.1 (CC-BY-4.0); el resto lo carga cada usuario.

## Roadmap de esta fase

1. ✅ `git init` + `.gitignore` + scripts `build:all` + esta guía.
2. ✅ `Dockerfile` + `.dockerignore` para PaaS.
3. ✅ `src/store.ts` migrado a SQLite (`node:sqlite`). 90 tests verdes.
4. ✅ Auth propia (users, `scrypt` de node:crypto, token HMAC en cookie httpOnly) + aislamiento
   por usuario vía `AsyncLocalStorage` (`owner_id`). Frontend con login/registro/logout. 92 tests verdes.
5. ⏳ Desplegar en el PaaS elegido con disco persistente para `app.db` y `SESSION_SECRET` fijado.
