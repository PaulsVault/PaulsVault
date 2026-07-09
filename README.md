# dnd-mcp-server

Servidor MCP completo para gestionar campañas de **D&D 2024**: personajes, inventario, hechizos, combate, compañeros, dados y personalización de la hoja. Funciona en Claude Desktop (computador) y como conector remoto para la app de Claude en móvil/tablet.

## Qué incluye

**25 tools** organizadas por flujo de trabajo:

| Área | Tools |
|---|---|
| Contenido | `dnd_search_content`, `dnd_get_content`, `dnd_import_content_pack`, `dnd_list_content_packs` |
| Personajes | `dnd_create_character`, `dnd_list_characters`, `dnd_get_character`, `dnd_update_character`, `dnd_level_up`, `dnd_delete_character`, `dnd_export_character`, `dnd_import_character` |
| Inventario | `dnd_manage_inventory`, `dnd_manage_currency` |
| Hechizos | `dnd_manage_spells`, `dnd_manage_spell_slots` |
| Combate | `dnd_update_hp`, `dnd_manage_conditions`, `dnd_manage_effects`, `dnd_rest` |
| Compañeros | `dnd_manage_companions` |
| Dados | `dnd_roll_dice`, `dnd_check` |
| Hoja | `dnd_customize_sheet`, `dnd_server_info` |

Todo lo derivable se calcula solo: CA según armadura equipada (light/medium/heavy/escudo), salvaciones, bonos de habilidad con competencia y pericia, DC e impacto de conjuro, slots por nivel de lanzador con multiclase (full/half/third caster + Pact Magic de Warlock), percepción pasiva, capacidad de carga, sintonización (máx 3).

Reglas 2024 implementadas: daño a PG temporales primero, salvaciones de concentración (DC max(10, daño/2)), muerte por daño masivo, salvaciones de muerte con crítico/pifia, Exhaustion acumulable 1–6, descansos corto/largo con recuperación de rasgos y hit dice, upcasting, ritual casting, ventaja/desventaja.

## Instalación

Requiere Node.js ≥ 18.

```bash
npm install
npm run build
```

## Uso en Claude Desktop (computador)

Agrega a tu configuración de Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "dnd": {
      "command": "node",
      "args": ["/ruta/absoluta/a/dnd-mcp-server/dist/index.js"]
    }
  }
}
```

Reinicia Claude Desktop. Luego pide cosas como:

- «Crea un mago elfo nivel 3 llamado Kaelen, stats 8/14/14/16/12/10»
- «Equípale armadura de cuero y una daga, y enséñale Fire Bolt y Magic Missile»
- «Lanza Magic Missile a nivel 2»
- «Recibe 12 de daño» → avisa de la salvación de concentración automáticamente
- «Tirada de sigilo con ventaja»
- «Descanso largo» / «Sube a nivel 4»

## Uso en móvil/tablet (conector remoto)

La app de Claude en móvil se conecta a servidores MCP remotos por HTTP. Despliega el servidor en cualquier host con Node (Railway, Fly.io, un VPS, tu propia máquina con túnel):

```bash
TRANSPORT=http PORT=3000 node dist/index.js
```

Endpoint MCP: `POST https://tu-host/mcp` · Salud: `GET /health`

Luego en Claude (Ajustes → Conectores → Agregar conector personalizado) apunta a `https://tu-host/mcp`. **Importante:** el modo HTTP no incluye autenticación; ponlo detrás de un reverse proxy con token/Bearer o una URL privada si lo expones a internet.

Los datos son los mismos en ambos modos si comparten `DND_DATA_DIR`; para usar el mismo personaje en desktop y móvil, usa el modo HTTP como fuente única o sincroniza el directorio de datos.

## Datos y respaldos

Todo se guarda en JSON en `~/.dnd-mcp` (o la ruta de `DND_DATA_DIR`):

```
~/.dnd-mcp/
├── characters.json
└── content-packs/
    └── srd-core.json
```

Respalda copiando ese directorio, o exporta un personaje con `dnd_export_character` (formato `json` reimportable o `markdown` legible).

## Contenido y licencia

El contenido sembrado proviene del **SRD 5.2** (reglas D&D 2024), licencia **Creative Commons CC-BY-4.0** de Wizards of the Coast: 12 clases, 10 especies, 4 trasfondos, condiciones, armas con Mastery, armaduras y hechizos esenciales. El PHB 2024 completo es propiedad de WotC y no puede distribuirse; agrega tu propio contenido (comprado, homebrew, futuro) con **content packs**.

### Formato de content pack

Importa con `dnd_import_content_pack`:

```json
{
  "id": "mi-pack",
  "name": "Mi contenido",
  "version": "1.0.0",
  "source": "Homebrew",
  "entries": [
    {
      "id": "spell-mi-hechizo",
      "type": "spell",
      "name": "Rayo Lunar Menor",
      "data": { "level": 1, "school": "Evocation", "classes": ["Druid"], "concentration": true, "summary": "1d8 radiante en área..." }
    }
  ]
}
```

Tipos: `class`, `subclass`, `species`, `background`, `feat`, `spell`, `item`, `condition`, `rule`, `monster`. Reimportar un pack con el mismo `id` lo actualiza (así se aplican erratas o expansiones).

## Desarrollo

```
src/
├── index.ts        # entry point, transporte stdio/HTTP
├── types.ts        # modelo de dominio
├── store.ts        # persistencia JSON atómica + siembra del SRD
├── rules.ts        # motor de reglas (CA, slots, bonos, hoja derivada)
├── dice.ts         # dados con crypto.randomInt (kh/kl, crit/pifia)
├── data/srd-core.json
└── tools/          # content, characters, inventory, spells, combat, misc
```

`npm run build` compila y copia los datos. `npm run dev` para watch.
