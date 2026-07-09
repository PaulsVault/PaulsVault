// Aísla los datos de los tests en un directorio temporal por proceso de test.
// DEBE fijarse antes de importar `store.ts` (calcula DATA_DIR al importarse); por eso
// va en setupFiles, que corre antes de los módulos de test. El pack SRD se siembra
// automáticamente desde src/data/srd-core.json (store.ensureDirs).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env["DND_DATA_DIR"] = mkdtempSync(join(tmpdir(), "dnd-test-"));
