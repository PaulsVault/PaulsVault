# PRD — App independiente de D&D 2024

**Producto:** Aplicación de gestión de personajes y mesa de D&D 5e (reglas 2024 / SRD 5.2)
**Estado del documento:** v1.0 — listo para desarrollo
**Autor:** Equipo del proyecto `dnd-mcp-server`
**Última actualización:** 2026-07-06

---

## 1. Resumen ejecutivo

Ya existe un **motor de reglas completo y validado** de D&D 5e (2024) implementado en TypeScript (`src/`), hoy expuesto como servidor **MCP** (interfaz para IA). Este PRD define cómo convertir ese motor en una **aplicación independiente** —usable directamente por una persona en computador, tablet y móvil, **sin necesidad de Claude ni de ninguna IA**— manteniendo el MCP como interfaz *opcional* para asistentes.

La app no reescribe reglas: reutiliza el motor. El trabajo de producto es (1) exponer la lógica como capa de dominio limpia, (2) ponerle una API HTTP propia, (3) construir una SPA responsive sobre ella, y (4) empaquetarla como PWA instalable.

### Principio rector
> Las reglas del juego viven **solo** en la capa de dominio. La UI nunca calcula CA, slots, bonos ni DC. Todo el contenido de juego sale de *content packs*, nunca hardcodeado.

---

## 2. Objetivos y no-objetivos

### 2.1 Objetivos
1. Que un jugador gestione toda la vida de un personaje 2024 (creación → juego → subida de nivel) desde una sola URL, en cualquier dispositivo.
2. Reutilizar el 100% del motor de reglas actual; el cálculo es idéntico venga de la app o del MCP.
3. Funcionar bien offline (PWA) para uso en mesa sin conexión fiable.
4. Permitir contenido extensible por *content packs* JSON (libros futuros, homebrew) sin tocar código.
5. Personalización visual profunda de la hoja (tema, color, tipografía, layout, retrato, CSS).

### 2.2 No-objetivos (v1)
- No es un VTT (tablero táctico, mapas, tokens de posición, línea de visión).
- No sincroniza en tiempo real *entre varios jugadores* como servicio multiusuario en la nube (single-user / self-host primero; SSE entre los dispositivos del mismo dueño es opcional).
- No incluye contenido más allá del **SRD 5.2** (restricción de copyright del PHB 2024).
- No hay cuentas, login social ni backend multi-tenant en v1.
- App de escritorio nativa (Tauri/Electron) queda para después, no prioritaria.

---

## 3. Usuarios y personas

| Persona | Necesidad principal | Dispositivo típico |
|---|---|---|
| **Jugador en mesa** | Consultar/editar su hoja rápido, tirar dados, trackear PG/condiciones/slots durante el combate | Móvil / tablet |
| **Jugador que prepara** | Crear personaje, subir de nivel, gestionar inventario y grimorio con calma | Desktop |
| **DM / power user** | Importar homebrew (content packs), llevar PNJs y compañeros, exportar/respaldar | Desktop |
| **Asistente IA (opcional)** | Operar sobre los mismos datos vía MCP | — |

---

## 4. Contexto técnico: qué se reutiliza (NO reescribir)

El motor agnóstico de UI en `src/`:

- **`types.ts`** — modelo de dominio completo: `Character`, `InventoryItem`, `Spellcasting`, `Companion`, `SheetStyle`, `ContentPack`, `ActiveCondition`, `ActiveEffect`, `Currency`…
- **`rules.ts`** — CA derivada de armadura/escudo equipados (ligera/media/pesada), salvaciones, skills con competencia/pericia, `spellStats` (DC = 8 + comp + mod; ataque = comp + mod), carga (`str × 15`), `computedSheet`, tabla de slots full-caster, `effectiveCasterLevel` (full/half/third), Pact Magic.
- **`dice.ts`** — RNG criptográfico (`crypto.randomInt`), parser `NdM[kh|kl|dh|dl X][±mod]`, ventaja/desventaja, detección de crítico/pifia.
- **`store.ts`** — persistencia JSON atómica en `DND_DATA_DIR` (default `~/.dnd-mcp`), siembra automática del pack SRD, gestión de content packs.
- **`data/srd-core.json`** — contenido SRD 5.2 (CC-BY-4.0): 12 clases, 10 especies, 4 trasfondos, 15 condiciones, armas con Mastery, armaduras, 18 hechizos.
- **`tools/*.ts`** — flujos de negocio validados end-to-end (hoy acoplados a MCP). **Su lógica se extrae a `src/domain/`.**

### 4.1 Arquitectura objetivo

```
┌──────────────────────────────────────────────┐
│  Frontend SPA (React + Vite, PWA)             │  ← solo renderiza, nunca calcula reglas
└───────────────┬──────────────────────────────┘
                │ HTTP/JSON (+ SSE opcional)
┌───────────────▼──────────────────────────────┐
│  API REST (Express)                           │  ← wrappers finos sobre dominio
├───────────────────────────────────────────────┤
│  Servidor MCP (stdio/HTTP)  [opcional, IA]    │  ← wrappers finos sobre dominio
├───────────────────────────────────────────────┤
│  Capa de DOMINIO  src/domain/*.ts             │  ← TODAS las reglas de negocio
│  (funciones que reciben db/character,          │
│   mutan y devuelven resultado o lanzan error)  │
├───────────────────────────────────────────────┤
│  rules.ts · dice.ts · store.ts · types.ts      │  ← motor puro (ya existe)
└───────────────────────────────────────────────┘
```

**Regla de oro del refactor:** ni la API REST ni los tools MCP contienen reglas; ambos son adaptadores delgados que llaman a `src/domain/`. Una sola fuente de verdad.

---

## 5. Requisitos funcionales

Cada área mapea 1:1 con la lógica ya existente en el motor. Los **criterios de aceptación** describen el comportamiento real que hoy implementa el código y que la app debe preservar.

### 5.1 Personajes

**RF-CHR-1 · Crear personaje.** Formulario/wizard que captura nombre, clase (+subclase), nivel, especie, trasfondo, las seis características (1–30, ya con bonos de trasfondo), skills con competencia, alineamiento, jugador, apariencia, trasfondo narrativo, velocidad.
- *Aceptación:* PG iniciales = máx dado de golpe + mod CON, y por cada nivel extra promedio (`dado/2+1`) + mod CON, mínimo 1. Salvaciones, habilidad de conjuro y slots se derivan de la clase (según el content pack instalado). Nombre duplicado se rechaza.

**RF-CHR-2 · Listar personajes** con resumen (id, nombre, clases/nivel, especie, PG actual/máx + temp).

**RF-CHR-3 · Ver hoja** en tres vistas: `sheet` (calculada: CA + fórmula, iniciativa, salvaciones, skills, percepción pasiva, slots), `full` (datos crudos completos), `combat` (PG, CA, condiciones, efectos, death saves, concentración, compañeros).

**RF-CHR-4 · Actualizar personaje** por campos parciales: nombre, especie, trasfondo, alineamiento, velocidad, `ac_override` (número o null = volver a cálculo automático), bono de iniciativa, inspiración heroica, XP, apariencia/trasfondo/notas, características parciales, add/remove skills, pericia, idiomas, competencias de herramienta, add/remove rasgos (con usos y recarga), habilidad de conjuro.

**RF-CHR-5 · Subir de nivel** (guiado). Sube una clase existente o añade una nueva (multiclase a nivel 1). Recalcula PG (tirada `hp_roll` validada ≤ dado, o promedio), dados de golpe, slots (full/half/third + pacto) y bono de competencia. Aplica ASI parciales (máx 20 por característica). Guía a añadir rasgos del nuevo nivel desde el contenido.

**RF-CHR-6 · Eliminar personaje** con confirmación explícita (irreversible).

**RF-CHR-7 · Exportar/Importar personaje.** Export `json` (reimportable) o `markdown` (hoja formateada legible). Import genera id nuevo y renombra si colisiona (" (importado)"). Base para respaldo y migración entre dispositivos.

### 5.2 Inventario y dinero

**RF-INV-1 · Gestionar inventario:** acciones `add`, `remove`, `equip`, `unequip`, `attune`, `unattune`, `update`, `list`.
- *Aceptación:* Al `add`, si el nombre coincide con un ítem del contenido instalado, autocompleta tipo/CA/daño/peso/propiedades. Equipar armadura desequipa otras armaduras; equipar escudo desequipa otros escudos; **recalcula CA**. `attune` falla si ya hay 3 sintonizados. `update` permite mover a contenedor (o sacarlo con `null`). Peso cargado = Σ(peso×cantidad); capacidad = FUE×15.

**RF-INV-2 · Gestionar monedas** (pp/gp/ep/sp/cp): sumar/restar por denominación; falla si una denominación queda negativa (no auto-convierte). Devuelve total en oro.

### 5.3 Hechizos (grimorio)

**RF-SPL-1 · Gestionar hechizos:** `learn`, `forget`, `prepare`, `unprepare`, `cast`, `list`.
- *Aceptación:* `learn` autocompleta nivel/concentración/ritual desde el contenido; trucos quedan siempre preparados. `unprepare` no permite despreparar los "siempre preparados". `cast` valida que el slot ≥ nivel del hechizo (**upcasting**), consume slot normal o de pacto (`use_pact_slot`) o ninguno (`no_slot` para rituales/objetos); si el hechizo tiene concentración, **rompe la concentración anterior** y registra un efecto activo (con `duration_rounds` opcional). Devuelve DC de salvación y bono de ataque de conjuro.

**RF-SPL-2 · Ajustar slots** manualmente: `set_max` (por nivel), `spend`, `recover`, `recover_all` (incluye pacto). Para rasgos no estándar (p. ej. Arcane Recovery).

### 5.4 Combate

**RF-CMB-1 · PG, daño, curación y muerte** (`damage`/`heal`/`set_temp`/`set_max`/`death_save`/`stabilize`/`reset_death_saves`).
- *Aceptación:* El daño consume PG temporales primero (no acumulables: se conserva el mayor). Caer a 0 aplica **Unconscious** y rompe concentración. **Daño masivo** (exceso ≥ PG máx) = muerte instantánea. Daño a 0 PG = +1 fallo de salvación de muerte (2 fallos si es "fumble"/1 natural). Curar desde 0 quita Unconscious y resetea death saves. `death_save` "critical"/20 natural revive con 1 PG. 3 éxitos = estable; 3 fallos = muerte. Si el personaje concentra y recibe daño, avisa la salvación de CON (DC = máx(10, daño/2)).

**RF-CMB-2 · Condiciones** (`apply`/`remove`/`list`) sobre personaje o compañero. Devuelve el **resumen de reglas 2024** de la condición desde el contenido. Exhaustion es acumulable por niveles (1–6; nivel 6 = muerte). Aplicar Incapacitated/Paralyzed/Petrified/Stunned/Unconscious rompe concentración.

**RF-CMB-3 · Efectos activos** con duración (`add`/`remove`/`tick`/`break_concentration`/`list`). `tick` avanza N rondas y expira lo que llega a 0 (llamado al final de cada ronda). Efectos pueden aplicarse a compañeros. `add` con `concentration` rompe la concentración previa.

**RF-CMB-4 · Descansos** (`short`/`long`).
- *Aceptación:* **Corto:** gasta dados de golpe indicados (cura `tirada + mod CON` cada uno, tirada automática), recupera slots de pacto y rasgos de recarga corta. **Largo:** PG al máximo, recupera la mitad (mín 1) de los dados de golpe totales, todos los slots, rasgos corto+largo, baja Exhaustion 1 nivel, limpia efectos, PG temporales, concentración y death saves.

### 5.5 Compañeros y mascotas

**RF-CMP-1 · Gestionar compañeros** (`create`/`update`/`delete`/`list`/`damage`/`heal`): tipos companion/pet/familiar/mount/summon/sidekick, con PG propios, CA, velocidad, características parciales, ataques, condiciones, notas y arte. Borrar un compañero elimina también sus efectos asociados. Cada compañero tiene su propia tarjeta.

### 5.6 Dados y pruebas

**RF-DICE-1 · Bandeja de dados libre:** notación estándar (`1d20+5`, `4d6kh3`, `2d20kl1`, `3d8+2d6+4`), modo ventaja/desventaja para d20 simple, repetición `times` (máx 20), detección de crítico/pifia, desglose completo. Historial visible en la UI.

**RF-DICE-2 · Pruebas del personaje** (`skill`/`ability`/`save`/`initiative`/`attack`/`spell_attack`/`damage`) usando los modificadores calculados. Ataque con arma del inventario (finesse, ammunition→DES, bono mágico, competencia). Daño con duplicado de dados en crítico. Modificador situacional extra (`bonus`).

### 5.7 Personalización de hoja

**RF-STYLE-1 · Personalizar hoja** (`SheetStyle`): tema, color de acento (hex), tipografía, retrato (URL o `artPrompt`), layout (`classic`/`compact`/`spellcaster`/`landscape`), mostrar retrato, `customCss`, `tokens` libres. La UI **lee** este `style` para renderizar; solo cambia los campos incluidos.

### 5.8 Contenido (content packs)

**RF-CNT-1 · Buscar contenido** por texto, tipo, nivel de hechizo, clase de hechizo, con límite. **RF-CNT-2 · Ver entrada** por id o nombre. **RF-CNT-3 · Importar/actualizar pack** JSON (id único, sobreescribe = actualización; valida tipos de entrada). **RF-CNT-4 · Listar/eliminar packs** (el pack base `srd-core` se re-siembra al reiniciar). Toda la UI que ofrezca clases/especies/hechizos/objetos se alimenta de aquí.

### 5.9 Biblioteca multi-personaje y entrega a terceros

El motor ya guarda `characters: Character[]`; esta área lo eleva a experiencia de producto: **crear cuantos personajes individuales se quiera** y poder **entregar personajes distintos a otras personas** más tarde.

**RF-LIB-1 · Biblioteca multi-personaje.** Crear y mantener personajes ilimitados e independientes entre sí (cada uno con su propio estado; ninguno comparte datos con otro). La biblioteca los lista con retrato/resumen y permite buscar/filtrar por nombre, clase o nivel, y **archivar** los que no estén en uso sin borrarlos.

**RF-LIB-2 · Duplicar personaje.** Clonar un personaje existente como plantilla (id nuevo, nombre "… (copia)") para explorar variantes de build o generar pregenerados a partir de uno base.

**RF-SHARE-1 · Paquete portable de entrega (`.dndchar`).** Exportar un personaje como paquete **autocontenido** (JSON) que incluye: los datos del personaje + **los content packs homebrew que referencia** + su `SheetStyle` con el retrato embebido (data URL). Objetivo: que otra persona lo reciba y lo use idéntico aunque no tenga el mismo contenido instalado.

**RF-SHARE-2 · Importar paquete recibido.** Al importar un `.dndchar`, la app instala/actualiza los content packs incluidos (sin pisar homebrew propio salvo confirmación explícita), genera id nuevo para el personaje y renombra ante colisión. Resuelve dependencias de contenido y avisa de lo que falte.

**RF-SHARE-3 · Entregable de solo lectura.** Generar una versión para quien **no** tiene la app: hoja en Markdown (ya existe) y/o **PDF/impresión** de la hoja calculada respetando el estilo. Sirve para dar un personaje "listo para jugar" a alguien nuevo.

**RF-SHARE-4 · Entrega en lote.** Seleccionar varios personajes y exportarlos juntos en un solo archivo (p. ej. un grupo/party completo o un set de pregenerados) para repartirlos después.

### 5.10 Estados y modificadores activos (dentro y fuera de combate)

**Situación actual (gap):** las condiciones y efectos hoy se **listan** con su texto de reglas pero **no modifican los valores derivados** — `computeAC` solo considera armadura/escudo/`acOverride`, la velocidad es el valor crudo, y ninguna condición altera ventaja/desventaja, auto-fallos ni incapacitación. Esta área añade un **motor de modificadores activos** en la capa de dominio para que los estados y conjuros afecten la hoja de verdad, y se **trackeen de forma persistente estén o no en combate**. Las reglas de combinación (D&D 2024) y las tablas exactas de condiciones y hechizos del SRD 5.2 —para que el cálculo sea coherente con los manuales— están en el **§13 (Anexo de reglas de modificadores)**, que es la fuente normativa de esta área.

**RF-MOD-1 · Modelo de modificador.** Nuevo tipo `StatModifier` en el dominio: `{ target: "ac"|"speed"|"save"|"check"|"attack"|"initiative"|"damage"|"hp_max", op: "add"|"set"|"multiply"|"min"|"advantage"|"disadvantage"|"autofail"|"immune"|"resist"|"vulnerable", value?: número o dados ("1d4"), ability?/skill? (alcance), source, note }`. Distingue **valores fijos** (número que cambia la hoja: CA, velocidad) de **valores de tirada** (dados/ventaja que se aplican al tirar; ver §13.B). `ActiveCondition` y `ActiveEffect` ganan un campo opcional `mechanics: StatModifier[]`. Para el SRD, las mecánicas de cada condición viven en el **content pack** (no se hardcodean); el formato de datos sigue siendo compatible (campos opcionales).

**RF-MOD-2 · Aplicación a la hoja calculada.** `computedSheet` agrega base + modificadores activos y devuelve **valores finales con desglose y fuentes**, siguiendo el orden y las reglas de combinación de §13.A: CA final (p. ej. 15 → 22 con *Shield* +5 y *Haste* +2), velocidad final (**0** con Restrained/Grappled/Paralyzed/Petrified/Stunned/Unconscious; ×2 con *Haste*; −5×nivel por Exhaustion), ventaja/desventaja por prueba/salvación/ataque (no apilan; ventaja+desventaja = normal), **auto-fallo** de salvaciones FUE/DES (Paralyzed/Petrified/Stunned/Unconscious), **incapacitación** (no puede actuar) y "los ataques contra ti tienen ventaja" cuando la condición lo indique.

**RF-MOD-3 · Persistencia dentro y fuera de combate.** Estados y modificadores persisten entre combates y en exploración. Duración en **rondas** (combate, vía `tick`), **minutos/horas** (fuera de combate) o "hasta descanso"/indefinida. `tick` avanza rondas *o* tiempo; al expirar un efecto, **retira sus modificadores**. El descanso largo limpia los temporales (ya implementado).

**RF-MOD-4 · Concentración con efecto mecánico.** La concentración se trackea siempre y es visible. Romperla (daño con salvación fallida, condición incapacitante, nuevo conjuro de concentración, muerte) **retira automáticamente los modificadores** del efecto concentrado (p. ej. cae *Haste* → CA y velocidad vuelven a base; se avisa la regla de fin de *Haste*).

**RF-MOD-5 · Efectos personalizados con modificadores.** Al añadir un efecto (RF-CMB-3) o lanzar un conjuro se pueden declarar modificadores **inline** (buff/debuff homebrew), p. ej. "Maldición: −2 CA y desventaja en salvaciones de SAB". La UI permite crearlos, verlos y retirarlos.

**RF-MOD-6 · Visibilidad en la UI.** La hoja **resalta** cada valor afectado (CA, velocidad, salvaciones, iniciativa) con su origen y signo (buff verde / debuff rojo) y lista los estados activos con su resumen mecánico. El panel de combate y una **barra de estados** fuera de combate muestran lo mismo. La UI no calcula: todo sale del dominio.

---

## 6. API REST propuesta

Adaptadores finos sobre `src/domain/`. JSON en todas partes. Errores como `{ error: { message } }` con código HTTP adecuado (400 validación, 404 no encontrado, 409 conflicto, 422 regla de negocio).

| Recurso | Método · Ruta | Dominio |
|---|---|---|
| Personajes | `GET /api/characters` · `POST /api/characters` | list / create |
| | `GET /api/characters/:id?view=sheet\|full\|combat` | get |
| | `PATCH /api/characters/:id` · `DELETE /api/characters/:id` | update / delete |
| | `POST /api/characters/:id/level-up` | levelUp |
| | `GET /api/characters/:id/export?format=json\|md` · `POST /api/characters/import` | export / import |
| Biblioteca / entrega | `POST /api/characters/:id/duplicate` | duplicate |
| | `POST /api/characters/:id/package` (descarga `.dndchar`) · `POST /api/characters/import-package` | package / importPackage |
| | `GET /api/characters/:id/sheet.pdf` (o `export?format=pdf`) | pdf |
| | `POST /api/characters/export-batch` (varios ids → 1 archivo) | exportBatch |
| Inventario | `GET/POST /api/characters/:id/inventory` · `PATCH/DELETE …/inventory/:itemId` | manage |
| | `POST …/inventory/:itemId/equip` · `/attune` (+ unequip/unattune) | equip/attune |
| Dinero | `PATCH /api/characters/:id/currency` | currency |
| Hechizos | `GET/POST /api/characters/:id/spells` · `POST …/spells/cast` | manage/cast |
| | `PATCH /api/characters/:id/spell-slots` | slots |
| Combate | `POST /api/characters/:id/hp` · `/conditions` · `/effects` · `/rest` | combate |
| Estados/modificadores | `GET /api/characters/:id/modifiers` (desglose activo) · `/effects` y `/conditions` aceptan `mechanics[]` | modifiers |
| Compañeros | `GET/POST/PATCH/DELETE /api/characters/:id/companions[/:cid]` | companions |
| Dados | `POST /api/roll` · `POST /api/characters/:id/check` | dice / check |
| Estilo | `PATCH /api/characters/:id/style` | customize |
| Contenido | `GET /api/content?query&type&spell_level&spell_class` · `GET /api/content/:idOrName` | search/get |
| Packs | `GET/POST/DELETE /api/content-packs[/:id]` | packs |
| Sistema | `GET /api/health` · `GET /api/server-info` | info |
| Sync (opc.) | `GET /api/characters/:id/stream` (SSE) | push de cambios |

La SPA se sirve como estáticos desde el **mismo backend** (una sola URL para todos los dispositivos).

---

## 7. Requisitos no funcionales

- **RNF-1 · Compatibilidad de datos:** el formato de `characters.json` y de los content packs **no cambia**. Personajes creados por el MCP se abren en la app y viceversa.
- **RNF-2 · TypeScript estricto**, sin `any`. ESM (`type: module`, imports con `.js`).
- **RNF-3 · Responsive real:** funcional y cómodo en móvil (≥360px), tablet y desktop. Objetivos táctiles ≥44px.
- **RNF-4 · PWA:** manifest + service worker; instalable; hoja y datos consultables/editables offline con reconciliación al reconectar.
- **RNF-5 · Rendimiento:** interacción de hoja/combate < 100 ms percibidos (cálculo local del dominio, sin round-trips innecesarios); carga inicial < 2,5 s en 3G rápida.
- **RNF-6 · Licencia:** solo SRD 5.2; mantener atribución **CC-BY-4.0** visible. Nada del PHB 2024 fuera del SRD.
- **RNF-7 · Persistencia atómica** (ya provista por `store.ts`); respaldo = copiar `DND_DATA_DIR` o exportar personajes.
- **RNF-8 · Accesibilidad:** navegación por teclado, roles ARIA, contraste suficiente en todos los temas.
- **RNF-9 · Tests:** unit del dominio (vitest) cubriendo las reglas críticas (CA, slots, concentración, daño masivo, descansos); smoke de la API.

---

## 8. Pantallas / UX (frontend)

1. **Selector de personajes** — tarjetas con retrato, clase/nivel, PG; crear/importar.
2. **Hoja de personaje** — render de `computedSheet` respetando `SheetStyle` (tema, color, tipografía, layout, retrato, `customCss`, `tokens`). Bloques: características+mods, salvaciones, skills, CA con fórmula, iniciativa, velocidad, percepción pasiva, PG, dados de golpe, inspiración.
3. **Panel de combate** — PG/temp con daño/curación rápida, condiciones con su resumen de reglas, efectos con contador de rondas y botón *tick*, concentración, death saves (círculos), descansos corto/largo.
4. **Inventario** — lista con equipar/sintonizar (drag opcional), contenedores anidados, monedas, peso/carga con barra, badge de sintonización (máx 3).
5. **Grimorio** — hechizos por nivel, preparar/lanzar con slots visibles, upcasting, rituales, DC y ataque de conjuro, pacto aparte.
6. **Compañeros** — tarjetas propias con PG/CA/ataques/condiciones.
7. **Bandeja de dados** — entrada de notación + atajos (d20 ventaja/desventaja), historial con desglose y animación simple.
8. **Wizard de creación** y **wizard de subida de nivel** guiados por el contenido instalado.
9. **Biblioteca de contenido** — buscar/ver entradas, importar/eliminar content packs.
10. **Ajustes de estilo** — editor visual de `SheetStyle` con vista previa en vivo.

---

## 9. Roadmap por fases

Alineado al orden sugerido del proyecto:

- **Fase 1 — Dominio.** Extraer `src/tools/*.ts` → `src/domain/*.ts` (funciones puras sobre `db`/`character`). Tools MCP quedan como wrappers finos. Tests vitest de las reglas críticas. *Salida:* `npm run build` limpio + verde en tests, MCP idéntico en comportamiento.
- **Fase 2 — API + estáticos.** REST/JSON sobre el dominio; servir la SPA; smoke tests. SSE opcional.
- **Fase 3 — Frontend.** Hoja → combate → hechizos → inventario → compañeros → dados → wizards → personalización visual.
- **Fase 4 — PWA + pulido responsive.** Manifest, service worker, instalación, offline, ajuste fino móvil/tablet.
- **(Post-v1)** Empaquetado escritorio (Tauri/Electron); sync multi-dispositivo real.

---

## 10. Métricas de éxito

- Crear un personaje jugable de nivel 1 en < 3 min desde cero.
- Resolver una ronda de combate (daño, condición, tirada, tick) sin salir del panel de combate.
- 0 discrepancias de cálculo entre app y MCP sobre el mismo `characters.json`.
- Instalable como PWA y utilizable offline en una sesión de mesa completa.
- Un content pack homebrew nuevo aparece en la UI sin cambios de código.

---

## 11. Riesgos y decisiones abiertas

| # | Riesgo / pregunta | Nota |
|---|---|---|
| R1 | Entorno sin Node.js instalado | Bloquea build/test/serve; resolver antes de Fase 1. |
| R2 | Script `build` usa `mkdir -p`/`cp` (POSIX) | Puede fallar en Windows/cmd; evaluar alternativa cross-platform sin romper el actual. |
| R3 | Concurrencia app + MCP sobre el mismo JSON | `store.ts` es atómico por escritura, pero no hay locking multi-proceso; definir si importa en single-user. |
| R4 | Sync multi-dispositivo (SSE) | ¿v1 o post-v1? Afecta arquitectura de estado. |
| R5 | `customCss` de usuario en la SPA | Superficie de inyección; sandbox/saneado necesario. |
| R6 | Auth / exposición en red | Si se sirve fuera de localhost, definir protección mínima. |
| R7 | Generación de PDF de la hoja (RF-SHARE-3) | Elegir lib server-side (p. ej. Puppeteer/pdfkit) o `window.print()` en cliente con CSS de impresión; el segundo evita dependencia pesada. |
| R8 | Paquete `.dndchar` con retrato embebido | Data URLs de retrato pueden inflar el archivo; definir límite de tamaño / compresión. |
| R9 | Motor de modificadores (RF-MOD-*) toca `types.ts` y `computedSheet` | Añadir solo campos opcionales (`mechanics`) y valores derivados nuevos para **no romper** la compatibilidad de `characters.json` ni el comportamiento del MCP existente. |
| R10 | Interacción y apilamiento de modificadores | Definir reglas de acumulación (p. ej. mismo bonus no apila, sí el mayor; ventaja/desventaja no se suman) para evitar cálculos incorrectos. |

---

## 12. Anexo — Inventario de capacidades del motor (fuente del PRD)

Tools MCP existentes que se convierten en features/endpoints:

- **Contenido:** `dnd_search_content`, `dnd_get_content`, `dnd_import_content_pack`, `dnd_list_content_packs`.
- **Personaje:** `dnd_create_character`, `dnd_list_characters`, `dnd_get_character`, `dnd_update_character`, `dnd_level_up`, `dnd_delete_character`, `dnd_export_character`, `dnd_import_character`.
- **Inventario:** `dnd_manage_inventory`, `dnd_manage_currency`.
- **Hechizos:** `dnd_manage_spells`, `dnd_manage_spell_slots`.
- **Combate:** `dnd_update_hp`, `dnd_manage_conditions`, `dnd_manage_effects`, `dnd_rest`.
- **Otros:** `dnd_manage_companions`, `dnd_roll_dice`, `dnd_check`, `dnd_customize_sheet`, `dnd_server_info`.

Todas comparten la misma capa de dominio tras el refactor; la app y el MCP son dos caras del mismo motor.

---

## 13. Anexo — Reglas de modificadores y estados (SRD 5.2 / D&D 2024)

Fuente **normativa** del motor de modificadores (E14 / §5.10). Todo se calcula en el dominio; el contenido concreto (condiciones y hechizos) vive en `srd-core.json` y se amplía por packs. Objetivo: que los valores fijos y de tirada salgan **coherentes con los manuales 2024**.

### 13.A Reglas de combinación (D&D 2024)

1. **Ventaja/desventaja no se acumulan.** Varias fuentes de ventaja siguen siendo *una* ventaja (2d20, quedas el mayor). Con al menos una ventaja **y** una desventaja se anulan y tiras normal (1d20), sin importar cuántas haya de cada lado.
2. **Efectos con el mismo nombre no apilan.** Si dos comparten nombre, solo aplica el más potente mientras solapan (empate → el más reciente). Dos *Bless* no dan +2d4.
3. **Bonificadores de fuentes distintas sí suman.** *Shield* (+5) y *Haste* (+2) a la vez → +7 CA. Escudo de objeto, bonus mágico y cobertura suman.
4. **Base vs bonus (valores fijos vs afectados).**
   - **Base / `set`**: define el valor fijo (fórmula de CA de armadura; Defensa sin Armadura 10+DES+CON del Bárbaro o 10+DES+SAB del Monje; un conjuro que *fija* la CA). **Solo se usa una base** (la mejor aplicable); las bases no se suman entre sí.
   - **`add`**: bonificadores que se apilan sobre la base (respetando la regla de mismo nombre).
5. **Orden de cálculo.**
   - **CA** = base (mejor `set`) → + Σ `add` (escudo, mágico, *Shield*, *Haste*, cobertura) → `min`/suelo si existe.
   - **Velocidad** = base → ± ajustes planos (Exhaustion −5×nivel) → condiciones que fijan **0** (ganan sobre lo demás) → × multiplicadores (*Haste* ×2; aura que reduce a la mitad). Nunca < 0.
   - **Pruebas d20 (ataque/característica/salvación)** = modificador calculado → + `add` numéricos (Exhaustion −2×nivel) y de dado *en tirada* (*Bless*/*Guidance* +1d4; *Hunter's Mark* +1d6 al daño) → resolver ventaja/desventaja neta → aplicar **auto-fallo** si la condición lo impone.
6. **Auto-fallo y auto-crítico.** Paralyzed/Petrified/Stunned/Unconscious **auto-fallan** salvaciones de FUE y DES. Paralyzed/Unconscious: impactos a ≤5 ft son **críticos** (bandera contextual; no es un número de hoja).
7. **Incapacitación.** Incapacitated (incluida en Paralyzed/Petrified/Stunned/Unconscious) impide acciones/acciones adicionales/reacciones y **rompe concentración**.

### 13.B Valores fijos vs de tirada

- **Fijos** (modifican el número mostrado): CA (*Shield* +5, *Haste* +2), velocidad (Exhaustion −5×nivel, *Haste* ×2, 0 por condición), penalizador plano de Exhaustion (−2×nivel a d20).
- **De tirada** (se aplican al tirar; se muestran como anotación, nunca horneados en un estático): dados situacionales (*Bless*/*Guidance* +1d4, *Hunter's Mark* +1d6), ventaja/desventaja y auto-fallo. `StatModifier.value` admite número **o** notación de dados (`"1d4"`).

### 13.C Condiciones → mecánicas (SRD 5.2, ya en `srd-core.json`)

| Condición | Mecánica (modificadores / flags) |
|---|---|
| Blinded | auto-fallo pruebas que requieren vista; tus ataques desventaja; ataques contra ti ventaja |
| Charmed | no puedes atacar/objetivar al hechicero; él con ventaja en pruebas sociales contra ti |
| Deafened | auto-fallo pruebas que requieren oído |
| Exhaustion (1–6) | **−2×nivel a todas las tiradas d20**; **−5×nivel ft** velocidad; nivel 6 = muerte |
| Frightened | desventaja en pruebas y ataques si ves la fuente; no te acercas voluntariamente |
| Grappled | **velocidad 0**; desventaja en ataques salvo contra quien te agarra |
| Incapacitated | sin acciones/adicionales/reacciones; **rompe concentración**; no hablas |
| Invisible | ventaja en iniciativa; tus ataques ventaja; ataques contra ti desventaja |
| Paralyzed | incapacitado; **velocidad 0**; **auto-fallo FUE/DES**; ataques contra ti ventaja; crítico a ≤5 ft |
| Petrified | incapacitado; **velocidad 0**; resistencia a todo daño; inmune a veneno/Poisoned; auto-fallo FUE/DES; ataques contra ti ventaja |
| Poisoned | desventaja en ataques y pruebas de característica |
| Prone | desventaja en tus ataques; ataques contra ti: ventaja a ≤5 ft, desventaja a más; solo gatear/levantarte |
| Restrained | **velocidad 0**; tus ataques desventaja; ataques contra ti ventaja; **desventaja salvaciones DES** |
| Stunned | incapacitado; **auto-fallo FUE/DES**; ataques contra ti ventaja |
| Unconscious | incapacitado; **velocidad 0**; cae Prone; auto-fallo FUE/DES; ataques contra ti ventaja; crítico a ≤5 ft |

E14.3 añade a cada condición un bloque `mechanics: StatModifier[]` estructurado junto a su `summary` (texto de reglas) ya existente.

### 13.D Hechizos del SRD con efecto mecánico (presentes en el pack)

| Hechizo | Modelado |
|---|---|
| Shield | `add ac +5` hasta tu próximo turno; inmune a Magic Missile |
| Haste | `add ac +2`, `multiply speed ×2`, `advantage save dex`; al terminar, letargo (nota) |
| Bless | `add attack +1d4`, `add save +1d4` (de tirada) |
| Guidance | `add check +1d4` a una prueba (de tirada) |
| Hunter's Mark | `add damage +1d6` contra el objetivo marcado (de tirada) |
| Spirit Guardians | a enemigos en el aura: `multiply speed ×0.5` (aplica a compañero/PNJ trackeado) |
| Hold Person | impone la condición **Paralyzed** al objetivo (salvación SAB al final de cada turno) |
| Invisibility | impone la condición **Invisible** al objetivo (termina si ataca o lanza conjuro) |

Hechizos fuera del SRD (Mage Armor, Longstrider, Shield of Faith, Barkskin…) entran igual **vía content packs**, declarando su bloque `mechanics` con este mismo modelo (`set`/`add`/`multiply`/`min`). Así el motor los calcula sin tocar código.
