// GDELT DOC 2.0 (https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/): lista de artículos en JSON.
//   https://api.gdeltproject.org/api/v2/doc/doc?query=…&mode=artlist&format=json&maxrecords=…&timespan=24h
//   → {"articles":[{url,url_mobile,title,seendate:"AAAAMMDDTHHMMSSZ",socialimage,domain,language,sourcecountry}]}
//
// Límite estricto por IP (desde las IP compartidas de GitHub respondió 429 aun esperando 12 s entre llamadas).
// Por eso: UNA consulta por corrida, rotando guerras → mercados → RD según la hora, cada 10 min.
// Un 429 o el aviso de «limit requests» termina la corrida en «parcial» con el motivo; nunca se insiste.
// Se guarda solo titular, enlace, medio y fecha (nunca el texto). La GEO API respondió 404: no se usa.

import type { Tarea } from "../ingesta.ts";
import { type Categoria, clasificar } from "../geo.ts";
import { hashUrl, limpiarTexto, recortar } from "./feed.ts";

export const URL_GDELT = "https://api.gdeltproject.org/api/v2/doc/doc";

export interface ConsultaGdelt {
  id: "guerras" | "mercados" | "rd";
  categoria: Categoria;
  query: string;
}

export const CONSULTAS_GDELT: readonly ConsultaGdelt[] = [
  {
    id: "guerras",
    categoria: "guerra",
    query: "(war OR missile OR ceasefire OR airstrike OR invasion OR troops) sourcelang:english",
  },
  {
    id: "mercados",
    categoria: "mercado",
    query: '("stock market" OR "Federal Reserve" OR "oil prices" OR "bond yields" OR "central bank") sourcelang:english',
  },
  {
    id: "rd",
    categoria: "rd",
    query: '("Dominican Republic" OR "República Dominicana" OR "Santo Domingo")',
  },
];

export const MAX_REGISTROS = 50;

/** Qué consulta toca: cambia cada 10 minutos (la corrida de las :00 guerras, :10 mercados, :20 RD, …). */
export function consultaDelTurno(ahora: Date): ConsultaGdelt {
  const turno = Math.floor(ahora.getTime() / 600_000);
  return CONSULTAS_GDELT[turno % CONSULTAS_GDELT.length];
}

export function urlGdelt(c: ConsultaGdelt, maxRegistros = MAX_REGISTROS): string {
  const p = new URLSearchParams({
    query: c.query,
    mode: "artlist",
    format: "json",
    maxrecords: String(maxRegistros),
    timespan: "24h",
    sort: "datedesc",
  });
  return `${URL_GDELT}?${p.toString().replace(/\+/g, "%20")}`;
}

/** "20261015T143000Z" → "2026-10-15T14:30:00.000Z" (null si no tiene esa forma). */
export function fechaGdelt(seendate: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(seendate.trim());
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`;
  return Number.isFinite(Date.parse(iso)) ? iso : null;
}

export interface ArticuloGdelt {
  titular: string;
  url: string;
  medio: string;
  fecha: string;
  idioma: string | null;
}

export class AvisoGdelt extends Error {}

/**
 * Lee la respuesta de artlist. GDELT a veces responde 200 con un texto de aviso en vez de JSON
 * («Please limit requests to one every 5 seconds…»): eso es un límite, no un error de formato.
 */
export function parsearGdelt(texto: string): ArticuloGdelt[] {
  const limpio = texto.replace(/^﻿/, "").trim();
  if (!limpio.startsWith("{")) {
    const muestra = limpiarTexto(limpio).slice(0, 160);
    if (/limit|too many|rate/i.test(muestra)) throw new AvisoGdelt(`GDELT pidió esperar: «${muestra}»`);
    throw new Error(`Formato inesperado de GDELT (no es JSON): «${muestra}»`);
  }
  const doc = JSON.parse(limpio) as { articles?: unknown };
  if (doc.articles === undefined) return []; // sin artículos en la ventana: GDELT responde {}
  if (!Array.isArray(doc.articles)) throw new Error("Formato inesperado de GDELT: «articles» no es una lista");
  const salida: ArticuloGdelt[] = [];
  for (const a of doc.articles as Record<string, unknown>[]) {
    const url = typeof a.url === "string" ? a.url.trim() : "";
    const titular = typeof a.title === "string" ? limpiarTexto(a.title) : "";
    const fecha = typeof a.seendate === "string" ? fechaGdelt(a.seendate) : null;
    if (!/^https?:\/\//i.test(url) || !titular || !fecha) continue;
    const medio = typeof a.domain === "string" && a.domain.trim() ? a.domain.trim().toLowerCase() : new URL(url).hostname;
    const idioma = typeof a.language === "string" && a.language.trim() ? a.language.trim() : null;
    salida.push({ titular: recortar(titular), url, medio, fecha, idioma });
  }
  return salida;
}

export interface FilaNoticia {
  titular: string;
  url: string;
  medio: string;
  fecha: string;
  categoria: Categoria;
  pais: string | null;
  lat: string | null;
  lon: string | null;
  lugar: string | null;
  idioma: string | null;
  origen: "gdelt" | "rss";
  hash: string;
  fuente_id: string;
}

/** Artículos → filas de mercado.noticias, con categoría y lugar del nomenclátor. Sin duplicados por hash. */
export async function filasNoticias(
  articulos: ArticuloGdelt[],
  o: { fuenteId: string; origen: "gdelt" | "rss"; pista?: Categoria; medioRD?: boolean },
): Promise<{ filas: FilaNoticia[]; descartadas: number }> {
  const porHash = new Map<string, FilaNoticia>();
  let descartadas = 0;
  for (const a of articulos) {
    const c = clasificar(a.titular, { pista: o.pista, medioRD: o.medioRD });
    if (!c) {
      descartadas++;
      continue;
    }
    const hash = await hashUrl(a.url);
    if (porHash.has(hash)) continue;
    porHash.set(hash, {
      titular: a.titular,
      url: a.url,
      medio: a.medio,
      fecha: a.fecha,
      categoria: c.categoria,
      pais: c.lugar?.pais ?? null,
      lat: c.lugar?.lat ?? null,
      lon: c.lugar?.lon ?? null,
      lugar: c.lugar?.nombre ?? null,
      idioma: a.idioma,
      origen: o.origen,
      hash,
      fuente_id: o.fuenteId,
    });
  }
  return { filas: [...porHash.values()], descartadas };
}

export const tareaGdelt: Tarea = {
  nombre: "noticias-gdelt",
  fuenteId: "gdelt",
  async ejecutar(ctx) {
    const consulta = consultaDelTurno(ctx.ahora);
    let texto: string;
    try {
      // API pública sin clave: pasa por el lector como cualquier página (robots.txt antes de leer).
      // Una sola consulta por corrida; si GDELT responde 429, la corrida queda parcial.
      texto = (await ctx.obtener(urlGdelt(consulta))).texto;
    } catch (e) {
      const m = (e as Error).message;
      if (/HTTP 429/.test(m)) {
        return {
          parcial: true,
          advertencias: [`GDELT respondió 429 (límite por IP) en la consulta «${consulta.id}»; se reintenta en la próxima corrida`],
          detalle: { consulta: consulta.id, limite: true },
        };
      }
      throw e;
    }
    let articulos: ArticuloGdelt[];
    try {
      articulos = parsearGdelt(texto);
    } catch (e) {
      if (e instanceof AvisoGdelt) {
        return { parcial: true, advertencias: [e.message], detalle: { consulta: consulta.id, limite: true } };
      }
      throw e;
    }
    const { filas, descartadas } = await filasNoticias(articulos, { fuenteId: "gdelt", origen: "gdelt", pista: consulta.categoria });
    const nuevas = await ctx.guardar("noticias", filas as unknown as Record<string, unknown>[], { conflicto: "hash", ignorarDuplicados: true });
    return {
      detalle: {
        consulta: consulta.id,
        recibidos: articulos.length,
        nuevas,
        descartadas,
        con_lugar: filas.filter((f) => f.lat !== null).length,
      },
    };
  },
};
