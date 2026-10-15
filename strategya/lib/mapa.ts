// Geometría del mapa: proyección Equal Earth (d3-geo) sobre world-atlas 110m (topojson-client).
// Corre en el servidor: los contornos de los países llegan como trazos SVG ya calculados y el
// navegador solo maneja los pines. Las coordenadas sirven solo para dibujar.

import { geoEqualEarth, geoGraticule10, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import mundo from "world-atlas/countries-110m.json";
import type { Pin } from "./noticias";

export const ANCHO_MAPA = 960;
export const ALTO_MAPA = 468;

const topologia = mundo as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;

const proyeccion = geoEqualEarth().fitExtent(
  [
    [6, 6],
    [ANCHO_MAPA - 6, ALTO_MAPA - 6],
  ],
  { type: "Sphere" },
);
const trazo = geoPath(proyeccion).digits(1);

export interface GeometriaMapa {
  esfera: string;
  reticula: string;
  paises: { id: string; nombre: string; d: string }[];
  fronteras: string;
}

let cache: GeometriaMapa | null = null;

export function geometriaMapa(): GeometriaMapa {
  if (cache) return cache;
  const paises = feature(topologia, topologia.objects.countries) as unknown as FeatureCollection<Geometry, { name: string }>;
  cache = {
    esfera: trazo({ type: "Sphere" }) ?? "",
    reticula: trazo(geoGraticule10()) ?? "",
    paises: paises.features
      .map((f: Feature<Geometry, { name: string }>, i) => ({ id: String(f.id ?? i), nombre: f.properties?.name ?? "", d: trazo(f) ?? "" }))
      .filter((p) => p.d),
    fronteras: trazo(mesh(topologia, topologia.objects.countries, (a, b) => a !== b)) ?? "",
  };
  return cache;
}

export interface PinProyectado extends Pin {
  x: number;
  y: number;
}

/** Ubica cada pin en el plano del mapa. Si dos pines caen casi en el mismo punto, los separa un poco. */
export function proyectarPines(pines: Pin[]): PinProyectado[] {
  const salida: PinProyectado[] = [];
  for (const p of pines) {
    const xy = proyeccion([p.lon, p.lat]);
    if (!xy) continue;
    let [x, y] = xy;
    // Mismo lugar con distinto tipo (p. ej. noticia de RD y mercado de RD): corrimiento en espiral.
    let k = 0;
    while (salida.some((o) => Math.hypot(o.x - x, o.y - y) < 9) && k < 8) {
      k++;
      const angulo = k * 2.4;
      x = xy[0] + Math.cos(angulo) * 10 * Math.ceil(k / 3);
      y = xy[1] + Math.sin(angulo) * 10 * Math.ceil(k / 3);
    }
    salida.push({ ...p, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
  }
  return salida;
}
