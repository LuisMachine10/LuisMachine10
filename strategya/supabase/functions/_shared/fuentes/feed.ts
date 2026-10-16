// Utilidades comunes de noticias: lectura de feeds (RSS 2.0, RSS 1.0/RDF y Atom), limpieza de texto,
// normalización de URL y hash SHA-256 (Web Crypto: igual en Deno y en Node). Funciones puras.

import { XMLParser } from "fast-xml-parser";

export interface EntradaFeed {
  titulo: string;
  url: string;
  /** ISO 8601 en UTC, o null si la entrada no trae una fecha legible. */
  fecha: string | null;
  /** La fecha tal como vino (para saber si la fuente dio solo el día). */
  fechaCruda: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  isArray: (nombre) => nombre === "item" || nombre === "entry" || nombre === "link",
});

const ENTIDADES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…", laquo: "«", raquo: "»",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", uuml: "ü",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ", deg: "°",
  iquest: "¿", iexcl: "¡",
};

/** Decodifica entidades HTML, quita etiquetas y deja espacios simples. */
export function limpiarTexto(crudo: string): string {
  return crudo
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTIDADES[n] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

function texto(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return texto(v[0]);
  if (typeof v === "object") return texto((v as Record<string, unknown>)["#text"]);
  return "";
}

function enlace(v: unknown): string {
  const lista = Array.isArray(v) ? v : v === undefined ? [] : [v];
  // Atom: <link rel="alternate" href="…"/>; RSS: <link>…</link>
  const preferido =
    lista.find((l) => typeof l === "object" && l && (l as Record<string, unknown>)["@_rel"] === "alternate") ??
    lista.find((l) => typeof l === "object" && l && !(l as Record<string, unknown>)["@_rel"]) ??
    lista[0];
  if (preferido && typeof preferido === "object") {
    const href = (preferido as Record<string, unknown>)["@_href"];
    if (typeof href === "string") return href.trim();
  }
  return texto(preferido).trim();
}

/** Fecha de un feed (RFC 822 o ISO 8601) a ISO UTC. Null si no se entiende. */
export function fechaFeed(crudo: string): string | null {
  const s = crudo.trim();
  if (!s) return null;
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/**
 * elEconomista publica `<pubDate/><![CDATA[Fri, 16 Oct 2026 22:09:36 +0200]]>` (etiqueta vacía y la fecha
 * suelta detrás). Se reacomoda a `<pubDate>…</pubDate>`; ningún otro contenido se toca.
 */
function repararFechas(xml: string): string {
  return xml.replace(/<pubDate\s*\/>\s*<!\[CDATA\[([^\]]{1,80})\]\]>/g, "<pubDate>$1</pubDate>");
}

/** Lee un feed RSS 2.0, RSS 1.0 (RDF, como el del BIS) o Atom. Lanza si el documento no es un feed. */
export function parsearFeed(xml: string): EntradaFeed[] {
  // deno-lint-ignore no-explicit-any
  const doc = parser.parse(repararFechas(xml.replace(/^﻿/, ""))) as any;
  const items: unknown[] | undefined = doc?.rss?.channel?.item ?? doc?.RDF?.item ?? doc?.feed?.entry;
  const esFeed = doc?.rss || doc?.RDF || doc?.feed;
  if (!esFeed) throw new Error("Formato inesperado: no es un feed RSS ni Atom");
  const salida: EntradaFeed[] = [];
  for (const item of items ?? []) {
    // deno-lint-ignore no-explicit-any
    const i = item as any;
    const titulo = limpiarTexto(texto(i.title));
    const url = enlace(i.link) || texto(i.guid).trim() || (typeof i["@_about"] === "string" ? i["@_about"] : "");
    if (!titulo || !/^https?:\/\//i.test(url)) continue;
    const fechaCruda = texto(i.pubDate ?? i.date ?? i.published ?? i.updated).trim();
    salida.push({ titulo, url, fecha: fechaFeed(fechaCruda), fechaCruda });
  }
  return salida;
}

const RASTREO = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|ocid|cmpid|ref|ref_src|at_medium|at_campaign|xtor)$/i;

/**
 * Misma noticia, misma URL: https, host en minúsculas sin «www.», sin fragmento, sin parámetros de
 * rastreo (utm_*, fbclid…), parámetros ordenados, barras dobles colapsadas y sin barra final.
 */
export function normalizarUrl(url: string): string {
  const u = new URL(url.trim());
  u.protocol = "https:";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  u.hash = "";
  u.port = "";
  const params = [...u.searchParams.entries()].filter(([k]) => !RASTREO.test(k)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  u.search = "";
  for (const [k, v] of params) u.searchParams.append(k, v);
  let ruta = u.pathname.replace(/\/{2,}/g, "/");
  if (ruta.length > 1) ruta = ruta.replace(/\/$/, "");
  u.pathname = ruta;
  return u.toString();
}

/** SHA-256 (hex) de la URL normalizada. */
export async function hashUrl(url: string): Promise<string> {
  const datos = new TextEncoder().encode(normalizarUrl(url));
  const resumen = await crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Recorta un titular largo sin cortar palabras (los titulares se guardan tal cual, solo con tope). */
export function recortar(t: string, max = 300): string {
  if (t.length <= max) return t;
  const corte = t.slice(0, max - 1);
  return `${corte.slice(0, Math.max(corte.lastIndexOf(" "), max - 40))}…`;
}
