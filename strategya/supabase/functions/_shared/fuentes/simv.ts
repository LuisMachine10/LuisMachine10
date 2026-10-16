// SIMV · Superintendencia del Mercado de Valores de la República Dominicana.
//
// La página de resoluciones y el robots.txt responden 403 de Cloudflare (pruebas/muestras/simv/
// resoluciones-403-cloudflare.html): NO se leen ni se esquivan. El lector solo permite el feed RSS
// público (https://simv.gob.do/feed/), que trae noticias y los avisos de «Publicaciones oficiales».
// Las resoluciones EV/FI (emisiones, fondos) entran por carga manual a mercado.emisiones_rd.

import { XMLParser } from "fast-xml-parser";
import type { Tarea } from "../ingesta.ts";
import { textoPlano } from "./rd-comun.ts";

export const URL_FEED_SIMV = "https://simv.gob.do/feed/";

export interface ItemRss {
  titulo: string;
  url: string;
  /** ISO 8601 en UTC. */
  fecha: string;
  guid: string;
  categorias: string[];
  /** HTML de content:encoded (o description) tal cual vino. */
  contenido: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true, // CDATA se lee como texto normal (comportamiento por defecto)
  isArray: (nombre) => nombre === "category",
});

// deno-lint-ignore no-explicit-any
type Nodo = any;

function texto(n: Nodo): string {
  if (n === undefined || n === null) return "";
  if (typeof n === "string") return n;
  if (typeof n === "object" && "#text" in n) return String(n["#text"]);
  return "";
}

/**
 * Ítems de un feed RSS 2.0. Tolera un feed cortado: solo se leen los <item> completos
 * (la muestra real de la SIMV está truncada a 20 kB y su último ítem queda a medias).
 */
export function parsearItemsRss(xml: string): ItemRss[] {
  if (!/<rss[\s>]/i.test(xml) || !/<channel[\s>]/i.test(xml)) throw new Error("Formato inesperado: no es un feed RSS");
  const items: ItemRss[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    let nodo: Nodo;
    try {
      nodo = parser.parse(`<item>${m[1]}</item>`).item;
    } catch {
      continue; // ítem mal formado: se omite, no se adivina
    }
    const titulo = textoPlano(texto(nodo?.title));
    const url = texto(nodo?.link).trim();
    const fecha = new Date(texto(nodo?.pubDate));
    if (!titulo || !/^https?:\/\//.test(url) || Number.isNaN(fecha.getTime())) continue;
    items.push({
      titulo,
      url,
      fecha: fecha.toISOString(),
      guid: texto(nodo?.guid).trim() || url,
      categorias: (nodo?.category ?? []).map((c: Nodo) => textoPlano(texto(c))).filter(Boolean),
      contenido: texto(nodo?.["content:encoded"]) || texto(nodo?.description),
    });
  }
  return items;
}

export interface FilaFeed {
  institucion: string;
  titulo: string;
  url: string;
  fecha: string;
  hash: string;
  fuente_id: string;
}

export function filaFeed(institucion: string, fuenteId: string, item: ItemRss): FilaFeed {
  return {
    institucion,
    titulo: item.titulo,
    url: item.url,
    fecha: item.fecha,
    hash: `${institucion.toLowerCase()}:${item.guid}`,
    fuente_id: fuenteId,
  };
}

/** ¿Es un aviso de «Publicaciones oficiales» (donde la SIMV resume resoluciones del mes)? */
export function esPublicacionOficial(item: Pick<ItemRss, "titulo" | "categorias">): boolean {
  return /publicaciones oficiales/i.test(item.titulo) || item.categorias.some((c) => /publicaciones oficiales/i.test(c));
}

export const tareaSimv: Tarea = {
  nombre: "simv",
  fuenteId: "simv",
  async ejecutar(ctx) {
    const r = await ctx.obtener(URL_FEED_SIMV);
    const items = parsearItemsRss(r.texto);
    if (items.length === 0) throw new Error("El feed de la SIMV no trajo ningún ítem legible");
    await ctx.guardar("instituciones_feed", items.map((i) => filaFeed("SIMV", "simv", i)) as unknown as Record<string, unknown>[], {
      conflicto: "hash",
      ignorarDuplicados: true,
    });
    return {
      detalle: {
        items: items.length,
        publicaciones_oficiales: items.filter(esPublicacionOficial).length,
        ultimo: items.map((i) => i.fecha).sort().at(-1) ?? null,
      },
    };
  },
};
