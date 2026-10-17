// Mapa base del mundo como SVG estático: se genera al construir y el navegador lo guarda en caché.
// Así la página no carga los contornos de los países en cada visita y el mapa se ve nítido (vector).

import { svgMapaBase } from "@/lib/mapa";

export const dynamic = "force-static";

export function GET() {
  return new Response(svgMapaBase(), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
