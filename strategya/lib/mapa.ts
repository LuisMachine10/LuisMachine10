// Geometría del mapa: proyección Equal Earth (d3-geo) sobre world-atlas 50m (topojson-client).
// Corre en el servidor. El mapa base se sirve como un SVG estático (app/noticias/mapa.svg) que el
// navegador dibuja como vector, nítido en pantallas retina; el navegador solo maneja los pines.
// Las coordenadas sirven solo para dibujar.

import { geoEqualEarth, geoGraticule10, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import mundo from "world-atlas/countries-50m.json";
import type { Pin } from "./noticias";

export const ANCHO_MAPA = 960;
export const ALTO_MAPA = 468;

/** Código ISO 3166-1 numérico de República Dominicana en world-atlas. */
const ID_RD = "214";

const topologia = mundo as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;

const proyeccion = geoEqualEarth().fitExtent(
  [
    [6, 6],
    [ANCHO_MAPA - 6, ALTO_MAPA - 6],
  ],
  { type: "Sphere" },
);

/**
 * Contexto de dibujo compacto para d3-geo: descarta puntos a menos de `tolerancia` unidades del anterior
 * (por debajo de un píxel de pantalla) y escribe coordenadas relativas con un decimal. El 50m pasa de
 * ~1.3 MB de trazos a ~0.25 MB sin perder detalle visible.
 */
function contextoCompacto(tolerancia: number) {
  let salida = "";
  let anillo: [number, number][] = [];
  const num = (v: number) => {
    const r = Math.round(v * 10) / 10;
    return (Object.is(r, -0) ? 0 : r).toString().replace(/^(-?)0\./, "$1.");
  };
  const volcar = (cerrar: boolean) => {
    const pts: [number, number][] = [];
    for (let i = 0; i < anillo.length; i++) {
      const previo = pts[pts.length - 1];
      if (!previo || i === anillo.length - 1 || Math.hypot(anillo[i][0] - previo[0], anillo[i][1] - previo[1]) >= tolerancia) pts.push(anillo[i]);
    }
    anillo = [];
    if (pts.length < (cerrar ? 3 : 2)) return;
    let ax = Math.round(pts[0][0] * 10);
    let ay = Math.round(pts[0][1] * 10);
    let rel = "";
    for (let i = 1; i < pts.length; i++) {
      const bx = Math.round(pts[i][0] * 10);
      const by = Math.round(pts[i][1] * 10);
      if (bx === ax && by === ay) continue;
      const tx = num((bx - ax) / 10);
      const ty = num((by - ay) / 10);
      rel += (rel === "" ? "l" : tx.startsWith("-") ? "" : " ") + tx + (ty.startsWith("-") ? "" : " ") + ty;
      ax = bx;
      ay = by;
    }
    salida += `M${num(Math.round(pts[0][0] * 10) / 10)} ${num(Math.round(pts[0][1] * 10) / 10)}${rel}${cerrar ? "z" : ""}`;
  };
  return {
    beginPath() {},
    moveTo(x: number, y: number) {
      if (anillo.length) volcar(false);
      anillo = [[x, y]];
    },
    lineTo(x: number, y: number) {
      anillo.push([x, y]);
    },
    closePath() {
      volcar(true);
    },
    arc() {},
    /** Devuelve el trazo acumulado y reinicia. */
    fin(): string {
      if (anillo.length) volcar(false);
      const d = salida;
      salida = "";
      return d;
    },
  };
}

export interface GeometriaMapa {
  esfera: string;
  reticula: string;
  paises: { id: string; nombre: string; d: string; rd: boolean }[];
}

let cache: GeometriaMapa | null = null;

export function geometriaMapa(): GeometriaMapa {
  if (cache) return cache;
  const ctx = contextoCompacto(0.45);
  const trazo = (g: Parameters<ReturnType<typeof geoPath>>[0]) => {
    geoPath(proyeccion, ctx)(g);
    return ctx.fin();
  };
  const paises = feature(topologia, topologia.objects.countries) as unknown as FeatureCollection<Geometry, { name: string }>;
  cache = {
    esfera: trazo({ type: "Sphere" }),
    reticula: trazo(geoGraticule10()),
    paises: paises.features
      .map((f: Feature<Geometry, { name: string }>, i) => {
        const id = String(f.id ?? i);
        return { id, nombre: f.properties?.name ?? "", d: trazo(f), rd: id === ID_RD };
      })
      .filter((p) => p.d),
  };
  return cache;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/**
 * Mapa base como documento SVG independiente (se sirve en /noticias/mapa.svg y el navegador lo guarda en
 * caché). Colores del sistema de diseño escritos en el archivo: un SVG cargado como imagen no ve las
 * variables CSS de la página. Trazos finos que no engordan al escalar y precisión geométrica.
 */
export function svgMapaBase(): string {
  const g = geometriaMapa();
  const paises = g.paises.filter((p) => !p.rd).map((p) => p.d).join("");
  const rd = g.paises.find((p) => p.rd);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ANCHO_MAPA} ${ALTO_MAPA}" width="${ANCHO_MAPA}" height="${ALTO_MAPA}" shape-rendering="geometricPrecision">`,
    `<title>Mapa del mundo (Natural Earth vía world-atlas, dominio público)</title>`,
    `<defs><radialGradient id="mar" cx="50%" cy="45%" r="65%"><stop offset="0" stop-color="#121a2a"/><stop offset="1" stop-color="#0d121c"/></radialGradient></defs>`,
    `<path d="${g.esfera}" fill="url(#mar)" stroke="#232a3b" stroke-width="1" vector-effect="non-scaling-stroke"/>`,
    `<path d="${g.reticula}" fill="none" stroke="#1a2131" stroke-width="0.6" vector-effect="non-scaling-stroke"/>`,
    `<path d="${paises}" fill="#262e40" stroke="#3a445c" stroke-width="0.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`,
    rd ? `<path d="${rd.d}" fill="#2d4f8f" stroke="#4c8dff" stroke-width="0.8" stroke-linejoin="round" vector-effect="non-scaling-stroke"><title>${esc(rd.nombre)}</title></path>` : "",
    `</svg>`,
  ].join("");
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
