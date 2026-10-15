// Instituciones: Fed, BCE, BoJ, BoE y BIS por RSS; Tesoro de EE. UU. y CEPAL por su lista HTML de comunicados.
// Muestras reales del 15 oct 2026 en pruebas/muestras/instituciones/.
// FMI, OCDE y OFAC responden 403 a la lectura automática: no se consultan (lectura_automatica=false).
// Banco Mundial (aplicación JS sin feed) y BID (feed 404) no tienen una vía legible: no se consultan.
//
// Destino: mercado.instituciones_feed (institución, título, enlace, fecha). Nunca el texto del comunicado.

import type { Tarea } from "../ingesta.ts";
import { hashUrl, limpiarTexto, parsearFeed, recortar } from "./feed.ts";

export interface ItemInstitucion {
  titulo: string;
  url: string;
  fecha: string; // ISO UTC
  /** true = la fuente solo publica el día (CEPAL): la hora guardada es 12:00 UTC y no se muestra. */
  solo_fecha: boolean;
}

export interface FilaInstitucion extends ItemInstitucion {
  institucion: string;
  hash: string;
  fuente_id: string;
}

type Formato = "rss" | "tesoro_html" | "cepal_html";

export interface FuenteInstitucion {
  tarea: string;
  institucion: string;
  fuenteId: string;
  /** Cada URL puede guardar sus comunicados con otra etiqueta (p. ej. los discursos del BIS). */
  urls: { url: string; institucion?: string }[];
  formato: Formato;
}

export const FUENTES_INSTITUCIONES: readonly FuenteInstitucion[] = [
  { tarea: "instituciones-fed", institucion: "Fed", fuenteId: "fed_rss", formato: "rss", urls: [{ url: "https://www.federalreserve.gov/feeds/press_all.xml" }] },
  { tarea: "instituciones-bce", institucion: "BCE", fuenteId: "bce_rss", formato: "rss", urls: [{ url: "https://www.ecb.europa.eu/rss/press.html" }] },
  { tarea: "instituciones-boj", institucion: "BoJ", fuenteId: "boj_rss", formato: "rss", urls: [{ url: "https://www.boj.or.jp/en/rss/whatsnew.xml" }] },
  { tarea: "instituciones-boe", institucion: "BoE", fuenteId: "boe_rss", formato: "rss", urls: [{ url: "https://www.bankofengland.co.uk/rss/news" }] },
  {
    tarea: "instituciones-bis",
    institucion: "BIS",
    fuenteId: "bis_rss",
    formato: "rss",
    urls: [
      { url: "https://www.bis.org/doclist/all_pressrels.rss" },
      { url: "https://www.bis.org/doclist/cbspeeches.rss", institucion: "BIS · discursos de banqueros centrales" },
    ],
  },
  { tarea: "instituciones-tesoro", institucion: "Tesoro EE. UU.", fuenteId: "tesoro_prensa", formato: "tesoro_html", urls: [{ url: "https://home.treasury.gov/news/press-releases" }] },
  { tarea: "instituciones-cepal", institucion: "CEPAL", fuenteId: "cepal", formato: "cepal_html", urls: [{ url: "https://www.cepal.org/es/comunicados" }] },
];

/** Cuántos comunicados por lectura (los más recientes). */
const MAX_POR_FUENTE = 30;

/** «2026-10-14T00:00:00Z» o «2026-10-14»: la fuente da solo el día (el BIS publica así). */
const SOLO_DIA = /^\d{4}-\d{2}-\d{2}(T00:00(:00)?(\.0+)?Z)?$/;

export function parsearRssInstitucion(xml: string): ItemInstitucion[] {
  return parsearFeed(xml)
    .filter((e): e is typeof e & { fecha: string } => e.fecha !== null)
    .map((e) => ({ titulo: recortar(e.titulo), url: e.url, fecha: e.fecha, solo_fecha: SOLO_DIA.test(e.fechaCruda) }));
}

const atributo = (v: string) => v.replace(/^["']|["']$/g, "");

/**
 * Lista HTML de comunicados del Tesoro: cada uno es
 * <time datetime=2026-10-14T16:00:00Z …>…</time> … <h3 class=featured-stories__headline><a href=/news/press-releases/sb0659/ …>Título</a>
 */
export function parsearTesoroHtml(html: string, base = "https://home.treasury.gov"): ItemInstitucion[] {
  const re =
    /<time\s+datetime=("[^"]+"|'[^']+'|[^\s>]+)[^>]*>[\s\S]*?<\/time>[\s\S]{0,400}?<h3[^>]*featured-stories__headline[^>]*>\s*<a\s+href=("[^"]+"|'[^']+'|[^\s>]+)[^>]*>([\s\S]*?)<\/a>/gi;
  const salida: ItemInstitucion[] = [];
  for (const m of html.matchAll(re)) {
    const ms = Date.parse(atributo(m[1]));
    const titulo = limpiarTexto(m[3]);
    if (!Number.isFinite(ms) || !titulo) continue;
    salida.push({ titulo: recortar(titulo), url: new URL(atributo(m[2]), base).toString(), fecha: new Date(ms).toISOString(), solo_fecha: false });
  }
  return salida;
}

const MESES_ES: Record<string, string> = {
  ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
  jul: "07", ago: "08", sep: "09", set: "09", oct: "10", nov: "11", dic: "12",
};

/**
 * Lista HTML de comunicados de la CEPAL:
 * <h4 …><a href="/es/comunicados/…">Título</a></h4> <div …> 21 Sep 2026 | Comunicado de prensa </div>
 * Solo trae el día: se guarda a las 12:00 UTC (mismo día en todo el continente) con solo_fecha=true.
 */
export function parsearCepalHtml(html: string, base = "https://www.cepal.org"): ItemInstitucion[] {
  const re =
    /<h4[^>]*>\s*<a\s+href="(\/es\/comunicados\/[^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h4>[\s\S]{0,600}?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s*\|/g;
  const salida: ItemInstitucion[] = [];
  for (const m of html.matchAll(re)) {
    const mes = MESES_ES[m[4].toLowerCase()];
    const titulo = limpiarTexto(m[2]);
    if (!mes || !titulo) continue;
    const dia = m[3].padStart(2, "0");
    salida.push({
      titulo: recortar(titulo),
      url: new URL(m[1], base).toString(),
      fecha: `${m[5]}-${mes}-${dia}T12:00:00.000Z`,
      solo_fecha: true,
    });
  }
  return salida;
}

export function parsearInstitucion(formato: Formato, texto: string): ItemInstitucion[] {
  if (formato === "rss") return parsearRssInstitucion(texto);
  if (formato === "tesoro_html") return parsearTesoroHtml(texto);
  return parsearCepalHtml(texto);
}

export async function filasInstitucion(
  institucion: string,
  fuenteId: string,
  items: ItemInstitucion[],
): Promise<FilaInstitucion[]> {
  const recientes = [...items].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  const porHash = new Map<string, FilaInstitucion>();
  for (const it of recientes) {
    if (porHash.size >= MAX_POR_FUENTE) break;
    const hash = await hashUrl(it.url);
    if (!porHash.has(hash)) porHash.set(hash, { ...it, institucion, hash, fuente_id: fuenteId });
  }
  return [...porHash.values()];
}

export function tareaInstitucion(f: FuenteInstitucion): Tarea {
  return {
    nombre: f.tarea,
    fuenteId: f.fuenteId,
    async ejecutar(ctx) {
      const advertencias: string[] = [];
      const filas: FilaInstitucion[] = [];
      let leidas = 0;
      let leidos = 0;
      for (const { url, institucion } of f.urls) {
        try {
          const r = await ctx.obtener(url);
          const lista = parsearInstitucion(f.formato, r.texto);
          if (lista.length === 0) advertencias.push(`${url}: no se encontró ningún comunicado (¿cambió el formato?)`);
          leidos += lista.length;
          filas.push(...(await filasInstitucion(institucion ?? f.institucion, f.fuenteId, lista)));
          leidas++;
        } catch (e) {
          advertencias.push(`${url}: ${(e as Error).message}`);
        }
      }
      if (leidas === 0) throw new Error(advertencias.join(" · "));
      const unicas = [...new Map(filas.map((x) => [x.hash, x])).values()];
      const escritas = await ctx.guardar("instituciones_feed", unicas as unknown as Record<string, unknown>[], {
        conflicto: "hash",
        ignorarDuplicados: true,
      });
      const masReciente = unicas.map((x) => x.fecha).sort().at(-1) ?? null;
      return {
        parcial: advertencias.length > 0,
        advertencias,
        detalle: { institucion: f.institucion, leidos, nuevos: escritas, mas_reciente: masReciente },
      };
    },
  };
}

export const TAREAS_INSTITUCIONES: Tarea[] = FUENTES_INSTITUCIONES.map(tareaInstitucion);
