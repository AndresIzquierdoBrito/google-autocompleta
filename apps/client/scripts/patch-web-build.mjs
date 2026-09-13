import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve("web-build/index.html");
if (!existsSync(file)) process.exit(0);
let html = readFileSync(file, "utf8");
html = html.replace(/<html lang="[^"]*">/, '<html lang="es">');
html = html.replace(/ maximum-scale="[^"]*"/g, "");
if (!html.includes("name=\"description\"")) {
  html = html.replace(
    "</head>",
    '<meta name="description" content="Un juego de predicciones capturadas de búsqueda en español."></head>',
  );
}
writeFileSync(file, html);
