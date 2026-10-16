// Copia los recursos estáticos de CesiumJS (Apache-2.0) a public/cesium para que el navegador los cargue
// desde la misma app: Cesium.js, Workers, Assets, Widgets y ThirdParty. Corre en postinstall y prebuild.
// public/cesium está en .gitignore: se regenera desde node_modules/cesium en cada instalación.
// window.CESIUM_BASE_URL = "/cesium" (componentes/globo/VisorCesium.tsx).

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origen = join(raiz, "node_modules", "cesium", "Build", "Cesium");
const destino = join(raiz, "public", "cesium");
const PIEZAS = ["Cesium.js", "Workers", "Assets", "Widgets", "ThirdParty"];

if (!existsSync(origen)) {
  // Sin cesium instalado (p. ej. una instalación parcial): el globo cae al mapa 2D. No se rompe la instalación.
  console.warn(`[copiar-cesium] No existe ${origen}: no se copió Cesium (el globo usará el mapa 2D).`);
  process.exit(0);
}

const version = JSON.parse(readFileSync(join(raiz, "node_modules", "cesium", "package.json"), "utf8")).version;
const marca = join(destino, ".version");
if (existsSync(marca) && readFileSync(marca, "utf8").trim() === version && PIEZAS.every((p) => existsSync(join(destino, p)))) {
  console.log(`[copiar-cesium] public/cesium ya tiene Cesium ${version}.`);
  process.exit(0);
}

rmSync(destino, { recursive: true, force: true });
mkdirSync(destino, { recursive: true });
for (const p of PIEZAS) cpSync(join(origen, p), join(destino, p), { recursive: true });
const licencia = join(raiz, "node_modules", "cesium", "LICENSE.md");
if (existsSync(licencia)) cpSync(licencia, join(destino, "LICENSE.md"));
writeFileSync(marca, `${version}\n`);
console.log(`[copiar-cesium] Copiado Cesium ${version} a public/cesium.`);
