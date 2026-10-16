// Adaptado de God's Eye View (MIT, © 2026 Bilawal Sidhu) — src/layers/earthquakes/records.js
// (normalizeEarthquakeSnapshot) y src/layers/earthquakes/source.js. Portado a TypeScript estricto, con
// números exactos (jsonExacto) y la página oficial de cada evento.
//
// USGS · Earthquake Hazards Program, feeds GeoJSON (dominio público de EE. UU.).
// Documentación: https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
// Muestras de prueba: pruebas/muestras/usgs/ (SINTÉTICAS hasta que la sonda traiga las reales;
// ver sondas/lotes/27-globo.txt).

import { aDecimal, jsonExacto } from "../json.ts";
import type { Tarea } from "../ingesta.ts";

export const FEEDS_USGS = {
  "4.5_day": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson",
  significant_week: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson",
} as const;

export type FeedUsgs = keyof typeof FEEDS_USGS;

/** Magnitud mínima que se guarda (la misma de God's Eye View: sin magnitud no se puede afirmar M2.5+). */
export const MAGNITUD_MINIMA = 2.5;
export const RETENCION_DIAS = 14;

/** Fila lista para mercado.eventos_geo. Números como texto. */
export interface FilaEventoGeo {
  tipo: "sismo" | "ciclon";
  id_externo: string;
  titulo: string;
  lat: string;
  lon: string;
  magnitud: string | null;
  fecha_evento: string;
  url: string;
  datos: Record<string, unknown>;
  fuente_id: string;
}

export interface LecturaUsgs {
  filas: FilaEventoGeo[];
  omitidos: number;
}

const ID_USGS = /^[a-z0-9]{2,40}$/i;

function texto(v: unknown, max = 300): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && t.length <= max ? t : null;
}

/** Solo páginas del propio USGS. */
export function urlOficialUsgs(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 300) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.hostname === "earthquake.usgs.gov" && !u.username && !u.password &&
        u.pathname.startsWith("/earthquakes/eventpage/")
      ? u.href
      : null;
  } catch {
    return null;
  }
}

function invalido(motivo: string): never {
  throw new Error(`Respuesta de USGS con formato inesperado: ${motivo}`);
}

/**
 * Valida un feed COMPLETO antes de que reemplace los datos anteriores: si una sola entrada está mal formada,
 * se rechaza todo (como en God's Eye View). Las entradas sin magnitud o por debajo de M2.5 se omiten.
 */
export function parsearFeedUsgs(cuerpo: string, feed: FeedUsgs): LecturaUsgs {
  let doc: unknown;
  try {
    doc = jsonExacto(cuerpo);
  } catch {
    invalido("no es JSON");
  }
  // deno-lint-ignore no-explicit-any
  const d = doc as any;
  if (d?.type !== "FeatureCollection" || !Array.isArray(d.features)) invalido("no es un FeatureCollection");

  const filas: FilaEventoGeo[] = [];
  const ids = new Set<string>();
  let omitidos = 0;
  for (const [i, f] of (d.features as unknown[]).entries()) {
    // deno-lint-ignore no-explicit-any
    const feature = f as any;
    const coords = feature?.geometry?.coordinates;
    const p = feature?.properties;
    if (!Array.isArray(coords) || coords.length < 2 || !p || typeof p !== "object" || Array.isArray(p)) {
      invalido(`entrada ${i + 1} sin geometría o propiedades`);
    }
    if (feature.geometry.type != null && feature.geometry.type !== "Point") invalido(`entrada ${i + 1} no es un punto`);
    const lon = aDecimal(coords[0]);
    const lat = aDecimal(coords[1]);
    const prof = coords[2] == null ? null : aDecimal(coords[2]);
    if (lon === null || Math.abs(Number(lon)) > 180) invalido(`entrada ${i + 1} con longitud inválida`);
    if (lat === null || Math.abs(Number(lat)) > 90) invalido(`entrada ${i + 1} con latitud inválida`);
    if (coords[2] != null && prof === null) invalido(`entrada ${i + 1} con profundidad inválida`);
    const mag = p.mag == null ? null : aDecimal(p.mag);
    if (p.mag != null && (mag === null || Number(mag) > 10)) invalido(`entrada ${i + 1} con magnitud inválida`);

    // Sin magnitud no se puede afirmar que el evento sea M2.5+.
    if (mag === null || Number(mag) < MAGNITUD_MINIMA) {
      omitidos++;
      continue;
    }
    // Solo terremotos (los feeds también pueden traer voladuras de canteras u otros eventos).
    if (p.type != null && p.type !== "earthquake") {
      omitidos++;
      continue;
    }
    const id = typeof feature.id === "string" && ID_USGS.test(feature.id) ? feature.id : null;
    if (!id) invalido(`entrada ${i + 1} sin id de evento`);
    if (ids.has(id)) invalido(`id repetido ${id}`);
    ids.add(id);

    const ms = aDecimal(p.time);
    if (ms === null || !/^\d+$/.test(ms)) invalido(`entrada ${i + 1} sin hora del evento`);
    const fecha = new Date(Number(ms));
    if (Number.isNaN(fecha.getTime())) invalido(`entrada ${i + 1} con hora inválida`);

    const url = urlOficialUsgs(p.url);
    if (!url) {
      omitidos++; // sin página oficial no se muestra
      continue;
    }
    const lugar = texto(p.place);
    filas.push({
      tipo: "sismo",
      id_externo: id,
      titulo: texto(p.title) ?? `M ${mag}${lugar ? ` - ${lugar}` : ""}`,
      lat,
      lon,
      magnitud: mag,
      fecha_evento: fecha.toISOString(),
      url,
      datos: {
        lugar,
        profundidad_km: prof,
        tipo_magnitud: texto(p.magType, 10),
        alerta_pager: texto(p.alert, 10),
        tsunami: p.tsunami === "1" || p.tsunami === 1,
        significancia: aDecimal(p.sig),
        estado: texto(p.status, 20),
        actualizado: aDecimal(p.updated) ? new Date(Number(aDecimal(p.updated))).toISOString() : null,
        feeds: [feed],
      },
      fuente_id: "usgs",
    });
  }
  return { filas, omitidos };
}

/** Une varios feeds: un mismo evento puede venir en 4.5_day y en significant_week. */
export function unirSismos(lecturas: FilaEventoGeo[][]): FilaEventoGeo[] {
  const porId = new Map<string, FilaEventoGeo>();
  for (const filas of lecturas) {
    for (const f of filas) {
      const previa = porId.get(f.id_externo);
      if (!previa) {
        porId.set(f.id_externo, f);
        continue;
      }
      const feeds = new Set([...(previa.datos.feeds as string[]), ...(f.datos.feeds as string[])]);
      // Gana la versión que USGS actualizó más tarde.
      const masNueva = String(f.datos.actualizado ?? "") > String(previa.datos.actualizado ?? "") ? f : previa;
      porId.set(f.id_externo, { ...masNueva, datos: { ...masNueva.datos, feeds: [...feeds].sort() } });
    }
  }
  return [...porId.values()].sort((a, b) => b.fecha_evento.localeCompare(a.fecha_evento));
}

export const tareaSismosUsgs: Tarea = {
  nombre: "sismos-usgs",
  fuenteId: "usgs",
  async ejecutar(ctx) {
    const advertencias: string[] = [];
    const lecturas: FilaEventoGeo[][] = [];
    let omitidos = 0;
    for (const [feed, url] of Object.entries(FEEDS_USGS) as [FeedUsgs, string][]) {
      try {
        const r = await ctx.obtener(url);
        const l = parsearFeedUsgs(r.texto, feed);
        lecturas.push(l.filas);
        omitidos += l.omitidos;
      } catch (e) {
        advertencias.push(`${feed}: ${(e as Error).message}`);
      }
    }
    if (lecturas.length === 0) throw new Error(advertencias.join(" · "));

    // Lo que ya pasó la retención no se vuelve a guardar.
    const limite = new Date(ctx.ahora.getTime() - RETENCION_DIAS * 86_400_000).toISOString();
    const filas = unirSismos(lecturas).filter((f) => f.fecha_evento >= limite);
    const guardados = await ctx.guardar("eventos_geo", filas as unknown as Record<string, unknown>[], { conflicto: "id_externo" });
    const purgados = await ctx.rpc<number>("globo_purgar_sismos", { p_dias: RETENCION_DIAS, p_ahora: ctx.ahora.toISOString() });
    return {
      parcial: advertencias.length > 0,
      advertencias,
      detalle: { sismos: filas.length, guardados, omitidos, purgados: purgados ?? 0 },
    };
  },
};
