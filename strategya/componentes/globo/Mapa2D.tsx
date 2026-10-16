"use client";

// Mapa 2D de respaldo (cuando el navegador no tiene WebGL o Cesium no carga). Mismas capas y mismos puntos
// que el globo 3D, dibujados en SVG con d3-geo (proyección Natural Earth) y las fronteras de world-atlas
// (Natural Earth, dominio público). Sin mosaicos: el mapa base de Esri solo existe en el modo 3D.

import { geoGraticule10, geoNaturalEarth1, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { useMemo } from "react";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import paises from "world-atlas/countries-110m.json";
import type { PuntoGlobo } from "@/lib/globo/capas";
import { tamanoMarcador } from "@/lib/globo/visor";
import type { PropsVisorInterno } from "./VisorGlobo";

const ANCHO = 960;
const ALTO = 500;

const topo = paises as unknown as Topology<{ countries: GeometryCollection }>;
const MUNDO = feature(topo, topo.objects.countries) as FeatureCollection;

function lineaGeo(p: PuntoGlobo): Feature<Geometry>[] {
  const lineas: Feature<Geometry>[] = (p.lineas ?? []).map((l) => ({
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: l.map((q) => [q.lon, q.lat]) },
  }));
  const areas: Feature<Geometry>[] = (p.areas ?? []).map((a) => ({
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [a.map((q) => [q.lon, q.lat])] },
  }));
  return [...areas, ...lineas];
}

export default function Mapa2D({ puntos, seleccion, alSeleccionar }: PropsVisorInterno) {
  const { camino, proyeccion } = useMemo(() => {
    const proyeccion = geoNaturalEarth1().fitSize([ANCHO, ALTO], { type: "Sphere" });
    return { proyeccion, camino: geoPath(proyeccion) };
  }, []);

  const fondo = useMemo(
    () => ({
      esfera: camino({ type: "Sphere" }) ?? "",
      reticula: camino(geoGraticule10()) ?? "",
      paises: MUNDO.features.map((f, i) => ({ id: String(f.id ?? i), d: camino(f) ?? "" })),
    }),
    [camino],
  );

  // Los seleccionados y resaltados se dibujan al final para que queden encima.
  const ordenados = useMemo(
    () => [...puntos].sort((a, b) => Number(a.destacado) - Number(b.destacado) || Number(a.id === seleccion) - Number(b.id === seleccion)),
    [puntos, seleccion],
  );

  return (
    <div className="globo-mapa2d">
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        role="img"
        aria-label="Mapa del mundo con los puntos de las capas activas. La lista de abajo tiene los mismos puntos."
        preserveAspectRatio="xMidYMid meet"
      >
        <path d={fondo.esfera} className="globo2d-esfera" />
        <path d={fondo.reticula} className="globo2d-reticula" />
        <g className="globo2d-paises">
          {fondo.paises.map((p) => (
            <path key={p.id} d={p.d} />
          ))}
        </g>
        <g>
          {ordenados.flatMap((p) =>
            lineaGeo(p).map((f, i) => (
              <path
                key={`${p.id}#${i}`}
                d={camino(f) ?? ""}
                className={`globo2d-forma tono-${p.tono} ${f.geometry.type === "Polygon" ? "es-area" : "es-linea"}`}
              />
            )),
          )}
        </g>
        <g>
          {ordenados.map((p) => {
            const xy = proyeccion([p.lon, p.lat]);
            if (!xy) return null;
            const r = tamanoMarcador(p.capa, p.destacado) / 2 + 1;
            return (
              <circle
                key={p.id}
                cx={xy[0]}
                cy={xy[1]}
                r={p.id === seleccion ? r + 3 : r}
                className={`globo2d-punto tono-${p.tono}${p.capa === "ciclones" ? " es-ciclon" : ""}${p.id === seleccion ? " elegido" : ""}`}
                onClick={() => alSeleccionar(p.id)}
              >
                <title>{p.titulo}</title>
              </circle>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
