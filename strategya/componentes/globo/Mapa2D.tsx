"use client";

// Mapa 2D de respaldo (cuando el navegador no tiene WebGL, Cesium no carga, o Mena lo elige). Mismas capas y
// mismos puntos que el globo 3D, dibujados en SVG vectorial (nítido a cualquier densidad) con d3-geo
// (proyección Natural Earth) y las fronteras de world-atlas countries-50m (Natural Earth, dominio público).
// Sin mosaicos: el mapa base de Esri solo existe en el modo 3D.

import { geoGraticule10, geoNaturalEarth1, geoPath } from "d3-geo";
import type { Feature, Geometry } from "geojson";
import { useEffect, useMemo, useRef, useState } from "react";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import paises from "world-atlas/countries-50m.json";
import type { PuntoGlobo } from "@/lib/globo/capas";
import { anchoEtiqueta, descongestionar, tamanoMarcador, textoEtiqueta } from "@/lib/globo/visor";
import type { PropsVisorInterno } from "./VisorGlobo";

const ANCHO = 960;
const ALTO = 500;

const topo = paises as unknown as Topology<{ countries: GeometryCollection; land: GeometryCollection }>;
const TIERRA = feature(topo, topo.objects.land);
const FRONTERAS = mesh(topo, topo.objects.countries, (a, b) => a !== b);

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
  const [encima, setEncima] = useState<string | null>(null);
  // Unidades del viewBox por píxel en pantalla: en el celular el mapa se reduce casi a un tercio, así que
  // las etiquetas y los marcadores se agrandan en la misma proporción para verse a su tamaño real.
  const lienzo = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);
  useEffect(() => {
    const el = lienzo.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const medir = () => {
      const caja = el.querySelector("svg")?.getBoundingClientRect();
      if (caja && caja.width > 0 && caja.height > 0) setEscala(Math.max(1, Math.max(ANCHO / caja.width, ALTO / caja.height)));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const agrandar = Math.max(1, escala * 0.7);
  const { camino, proyeccion } = useMemo(() => {
    const proyeccion = geoNaturalEarth1().fitExtent(
      [
        [4, 4],
        [ANCHO - 4, ALTO - 4],
      ],
      { type: "Sphere" },
    );
    return { proyeccion, camino: geoPath(proyeccion) };
  }, []);

  const fondo = useMemo(
    () => ({
      esfera: camino({ type: "Sphere" }) ?? "",
      reticula: camino(geoGraticule10()) ?? "",
      tierra: camino(TIERRA) ?? "",
      fronteras: camino(FRONTERAS) ?? "",
    }),
    [camino],
  );

  // Los resaltados y el elegido se dibujan al final para que queden encima.
  const ordenados = useMemo(
    () => [...puntos].sort((a, b) => Number(a.destacado) - Number(b.destacado) || Number(a.id === seleccion) - Number(b.id === seleccion)),
    [puntos, seleccion],
  );

  // Etiquetas: la del elegido, la del punto bajo el puntero y RD; si se enciman, gana la de más prioridad.
  const candidatos = [seleccion, encima, puntos.find((p) => p.capa === "rd")?.id ?? null].filter(
    (id, i, a): id is string => !!id && a.indexOf(id) === i,
  );
  const cajas = candidatos.flatMap((id, prioridad) => {
    const p = puntos.find((q) => q.id === id);
    const xy = p ? proyeccion([p.lon, p.lat]) : null;
    if (!p || !xy) return [];
    const alto = 22 * escala;
    return [{ id, x: xy[0], y: xy[1] - ((tamanoMarcador(p.capa, p.destacado) / 2) * agrandar + 6 * escala), ancho: anchoEtiqueta(textoEtiqueta(p)) * escala, alto, prioridad }];
  });
  const visiblesEtq = descongestionar(cajas, 2 * escala);
  const conEtiqueta = candidatos.filter((id) => visiblesEtq.has(id)).reverse();

  return (
    <div className="globo-mapa2d" ref={lienzo}>
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        role="img"
        aria-label="Mapa del mundo con los puntos de las capas activas. La lista de abajo tiene los mismos puntos."
        preserveAspectRatio="xMidYMid meet"
        shapeRendering="geometricPrecision"
      >
        <path d={fondo.esfera} className="globo2d-esfera" />
        <path d={fondo.reticula} className="globo2d-reticula" />
        <path d={fondo.tierra} className="globo2d-tierra" />
        <path d={fondo.fronteras} className="globo2d-fronteras" />
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
            const r = (tamanoMarcador(p.capa, p.destacado) / 2) * agrandar;
            const elegido = p.id === seleccion;
            return (
              <g key={p.id} className={`tono-${p.tono}`}>
                {p.destacado ? <circle cx={xy[0]} cy={xy[1]} r={r + 6 * agrandar} className="globo2d-halo" /> : null}
                <circle
                  cx={xy[0]}
                  cy={xy[1]}
                  r={elegido ? r + 2 * agrandar : r}
                  className={`globo2d-punto${p.capa === "ciclones" ? " es-ciclon" : ""}${elegido ? " elegido" : ""}`}
                  onClick={() => alSeleccionar(p.id)}
                  onMouseEnter={() => setEncima(p.id)}
                  onMouseLeave={() => setEncima((e) => (e === p.id ? null : e))}
                >
                  <title>{p.titulo}</title>
                </circle>
              </g>
            );
          })}
        </g>
        <g className="globo2d-etiquetas" aria-hidden="true">
          {conEtiqueta.map((id) => {
            const p = puntos.find((q) => q.id === id);
            const xy = p ? proyeccion([p.lon, p.lat]) : null;
            if (!p || !xy) return null;
            const texto = textoEtiqueta(p);
            const ancho = anchoEtiqueta(texto) * escala;
            const y = xy[1] - ((tamanoMarcador(p.capa, p.destacado) / 2) * agrandar + 6 * escala);
            const x = Math.min(Math.max(xy[0], ancho / 2 + 4), ANCHO - ancho / 2 - 4);
            return (
              <g key={id} transform={`translate(${x} ${y})`}>
                <rect x={-ancho / 2} y={-22 * escala} width={ancho} height={22 * escala} rx={6 * escala} className="globo2d-etiqueta-fondo" />
                <text x={0} y={-7 * escala} textAnchor="middle" className="globo2d-etiqueta" fontSize={12 * escala}>
                  {texto}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
