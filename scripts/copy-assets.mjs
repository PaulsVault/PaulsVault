// Copia los assets de datos (content packs SRD) a dist/ de forma cross-platform.
// Reemplaza el antiguo `mkdir -p dist/data && cp ...` (POSIX) que fallaba en Windows.
import { cpSync, mkdirSync } from "node:fs";

mkdirSync("dist/data", { recursive: true });
cpSync("src/data", "dist/data", { recursive: true });

console.log("Assets copiados: src/data -> dist/data");
