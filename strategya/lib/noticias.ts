// Armado de datos para las pantallas de Noticias, Instituciones, Fusiones e IPO, Agenda, Qué vigilar y Mapa.
// Sin red y sin base: recibe filas ya leídas y solo filtra, agrupa y ordena. No inventa ni rellena nada.

import Big from "big.js";
import { cifraConSigno, direccion, ZONA_RD } from "./formato";

export type CategoriaNoticia = "guerra" | "mercado" | "rd" | "instituciones";

export interface Noticia {
  id: number;
  titular: string;
  url: string;
  medio: string;
  fecha: string;
  categoria: CategoriaNoticia;
  pais: string | null;
  lat: string | null;
  lon: string | null;
  lugar: string | null;
  fuente_id: string | null;
}

export interface ComunicadoInstitucion {
  institucion: string;
  titulo: string;
  url: string;
  fecha: string;
  solo_fecha: boolean;
  fuente_id: string | null;
}

export interface OperacionSec {
  form: string;
  tipo: "ipo" | "fusion";
  empresa: string;
  cik: string;
  fecha: string;
  url: string;
  indice_fecha: string;
  recogido_en: string;
}

export interface EventoAgenda {
  id: number;
  fecha_hora: string;
  institucion: string;
  evento: string;
  importancia: number;
  confirmado: boolean;
  url: string | null;
  hora_conocida: boolean;
  zona: string | null;
  nota: string | null;
}

export interface Movimiento {
  serie_id: string;
  nombre: string;
  nombre_corto: string;
  categoria: string;
  unidad: string;
  sustituto_de: string | null;
  max_antiguedad_min: number;
  meta: Record<string, unknown> | null;
  valor: string;
  cambio: string | null;
  cambio_pct: string | null;
  fecha_dato: string;
  hora_dato: string | null;
  recogido_en: string;
  url_dato: string | null;
  estado: string;
  fuente_nombre: string;
  fuente_url: string;
}

export const ETIQUETA_CATEGORIA: Record<CategoriaNoticia, string> = {
  guerra: "Guerra",
  mercado: "Mercado",
  rd: "RD",
  instituciones: "Instituciones",
};

// ───────────────────────── Fechas ─────────────────────────

/** Día de hoy en RD (AAAA-MM-DD). */
export function hoyRD(ahora: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_RD, year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}

/** Fecha local (AAAA-MM-DD) de un instante en una zona. */
export function fechaEnZona(iso: string, zona: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

// ───────────────────────── Noticias ─────────────────────────

export function filtrarNoticias(noticias: Noticia[], categoria?: CategoriaNoticia, limite = 20): Noticia[] {
  return noticias
    .filter((n) => !categoria || n.categoria === categoria)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
    .slice(0, limite);
}

/** Cuenta por categoría (para el resumen del panel y la selección del glosario). */
export function conteoCategorias(noticias: Noticia[]): Record<CategoriaNoticia, number> {
  const c: Record<CategoriaNoticia, number> = { guerra: 0, mercado: 0, rd: 0, instituciones: 0 };
  for (const n of noticias) c[n.categoria]++;
  return c;
}

// ───────────────────────── Instituciones ─────────────────────────

export interface EstadoInstitucion {
  institucion: string;
  /** rss/html: se lee; bloqueada: responde 403 y no se consulta; sin_feed: no hay una vía legible. */
  via: "rss" | "html" | "bloqueada" | "sin_feed";
  url: string;
  ultimo: ComunicadoInstitucion | null;
  /** Otros comunicados recientes (hasta 2). */
  anteriores: ComunicadoInstitucion[];
  motivo?: string;
}

export interface InstitucionCatalogo {
  institucion: string;
  via: EstadoInstitucion["via"];
  url: string;
  fuenteId?: string;
  motivo?: string;
}

/** Orden y vía de cada institución del panel. Las bloqueadas se rotulan, nunca se leen. */
export const INSTITUCIONES: readonly InstitucionCatalogo[] = [
  { institucion: "Fed", via: "rss", url: "https://www.federalreserve.gov/newsevents/pressreleases.htm", fuenteId: "fed_rss" },
  { institucion: "BCE", via: "rss", url: "https://www.ecb.europa.eu/press/html/index.en.html", fuenteId: "bce_rss" },
  { institucion: "BoJ", via: "rss", url: "https://www.boj.or.jp/en/whatsnew/index.htm", fuenteId: "boj_rss" },
  { institucion: "BoE", via: "rss", url: "https://www.bankofengland.co.uk/news", fuenteId: "boe_rss" },
  { institucion: "BIS", via: "rss", url: "https://www.bis.org/press/index.htm", fuenteId: "bis_rss" },
  { institucion: "BIS · discursos de banqueros centrales", via: "rss", url: "https://www.bis.org/cbspeeches/index.htm", fuenteId: "bis_rss" },
  { institucion: "Tesoro EE. UU.", via: "html", url: "https://home.treasury.gov/news/press-releases", fuenteId: "tesoro_prensa" },
  { institucion: "CEPAL", via: "html", url: "https://www.cepal.org/es/comunicados", fuenteId: "cepal" },
  { institucion: "FMI", via: "bloqueada", url: "https://www.imf.org/en/News", fuenteId: "imf", motivo: "bloquea la lectura automática (403)" },
  { institucion: "OCDE", via: "bloqueada", url: "https://www.oecd.org/en/about/news.html", fuenteId: "oecd", motivo: "bloquea la lectura automática (403)" },
  { institucion: "OFAC", via: "bloqueada", url: "https://ofac.treasury.gov/recent-actions", fuenteId: "ofac", motivo: "bloquea la lectura automática (403)" },
  { institucion: "Banco Mundial", via: "sin_feed", url: "https://www.worldbank.org/en/news/all", motivo: "sin feed legible (la página es una aplicación JavaScript)" },
  { institucion: "BID", via: "sin_feed", url: "https://www.iadb.org/es/noticias", motivo: "sin feed público encontrado (404)" },
];

/**
 * Lo último de cada institución, en el orden del catálogo.
 * `bloqueadas`: ids de fuentes con lectura_automatica=false en la base (si la base dice que una fuente
 * pasó a bloqueada, el panel la rotula aunque el catálogo la tenga como legible).
 */
export function estadoInstituciones(items: ComunicadoInstitucion[], bloqueadas: ReadonlySet<string> = new Set()): EstadoInstitucion[] {
  const porInstitucion = new Map<string, ComunicadoInstitucion[]>();
  for (const it of [...items].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))) {
    const lista = porInstitucion.get(it.institucion) ?? [];
    lista.push(it);
    porInstitucion.set(it.institucion, lista);
  }
  return INSTITUCIONES.map((c) => {
    const bloqueada = c.via === "bloqueada" || (c.fuenteId !== undefined && bloqueadas.has(c.fuenteId));
    const lista = bloqueada || c.via === "sin_feed" ? [] : (porInstitucion.get(c.institucion) ?? []);
    return {
      institucion: c.institucion,
      via: bloqueada ? "bloqueada" : c.via,
      url: c.url,
      ultimo: lista[0] ?? null,
      anteriores: lista.slice(1, 3),
      motivo: bloqueada ? (c.motivo ?? "bloquea la lectura automática") : c.motivo,
    };
  });
}

// ───────────────────────── SEC ─────────────────────────

export function agruparOperaciones(ops: OperacionSec[], limitePorTipo = 15) {
  const orden = [...ops].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : a.empresa.localeCompare(b.empresa)));
  return {
    ipo: orden.filter((o) => o.tipo === "ipo").slice(0, limitePorTipo),
    fusion: orden.filter((o) => o.tipo === "fusion").slice(0, limitePorTipo),
    ultimoIndice: orden.map((o) => o.indice_fecha).sort().at(-1) ?? null,
  };
}

// ───────────────────────── Agenda ─────────────────────────

/** Eventos desde ahora (incluye los de hoy que ya pasaron hace menos de 3 h) hasta `dias` días adelante. */
export function proximosEventos(agenda: EventoAgenda[], ahora: Date, dias: number, limite = Infinity): EventoAgenda[] {
  const desde = ahora.getTime() - 3 * 3_600_000;
  const hasta = ahora.getTime() + dias * 86_400_000;
  return agenda
    .filter((e) => {
      const t = new Date(e.fecha_hora).getTime();
      // Si solo se conoce el día, el evento sigue «próximo» todo ese día en su zona.
      const fin = e.hora_conocida ? t : t + 86_400_000;
      return fin >= desde && t <= hasta;
    })
    .sort((a, b) => (a.fecha_hora < b.fecha_hora ? -1 : a.fecha_hora > b.fecha_hora ? 1 : b.importancia - a.importancia))
    .slice(0, limite);
}

// ───────────────────────── Qué vigilar ─────────────────────────

/** ¿El dato es de hoy en RD? (por su hora exacta si la tiene; si no, por la fecha del dato). */
export function esDeHoy(m: Pick<Movimiento, "fecha_dato" | "hora_dato">, ahora: Date): boolean {
  const hoy = hoyRD(ahora);
  return m.hora_dato ? fechaEnZona(m.hora_dato, ZONA_RD) === hoy : m.fecha_dato === hoy;
}

/** Las series que más se movieron hoy, por |cambio %| con aritmética decimal. Sin cambio publicado no entran. */
export function masMovidas(movs: Movimiento[], ahora: Date, limite = 5): Movimiento[] {
  return movs
    .filter((m) => m.cambio_pct !== null && esDeHoy(m, ahora) && !new Big(m.cambio_pct).eq(0))
    .sort((a, b) => new Big(b.cambio_pct!).abs().cmp(new Big(a.cambio_pct!).abs()) || a.serie_id.localeCompare(b.serie_id))
    .slice(0, limite);
}

// ───────────────────────── Mapa ─────────────────────────

export type TipoPin = "noticia" | "guerra" | "rd" | "sube" | "baja" | "igual";

export interface ElementoPin {
  texto: string;
  url: string | null;
  detalle: string;
}

export interface Pin {
  id: string;
  tipo: TipoPin;
  lugar: string;
  lat: number;
  lon: number;
  elementos: ElementoPin[];
}

export const ETIQUETA_PIN: Record<TipoPin, string> = {
  noticia: "Noticia",
  guerra: "Guerra",
  rd: "República Dominicana",
  sube: "Mercado sube",
  baja: "Mercado baja",
  igual: "Mercado sin cambio",
};

function tipoDeNoticia(c: CategoriaNoticia): TipoPin {
  return c === "guerra" ? "guerra" : c === "rd" ? "rd" : "noticia";
}

function coordenada(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v); // solo para ubicar el pin
  return null;
}

/** Noticias con lugar → pines agrupados por lugar y tipo (varios titulares de Gaza = un pin con su lista). */
export function pinesDeNoticias(noticias: Noticia[], porPin = 4): Pin[] {
  const grupos = new Map<string, Pin>();
  for (const n of filtrarNoticias(noticias, undefined, Infinity)) {
    const lat = coordenada(n.lat);
    const lon = coordenada(n.lon);
    if (lat === null || lon === null) continue;
    const tipo = tipoDeNoticia(n.categoria);
    const id = `${tipo}:${lat.toFixed(2)},${lon.toFixed(2)}`;
    const pin = grupos.get(id) ?? { id, tipo, lugar: n.lugar ?? n.pais ?? "", lat, lon, elementos: [] };
    if (pin.elementos.length < porPin) pin.elementos.push({ texto: n.titular, url: n.url, detalle: n.medio });
    grupos.set(id, pin);
  }
  return [...grupos.values()];
}

/** Series del catálogo con meta.lat/lon → pin verde (sube) o rojo (baja) según su último cambio. */
export function pinesDeSeries(movs: Movimiento[]): Pin[] {
  const grupos = new Map<string, Pin>();
  for (const m of [...movs].sort((a, b) => a.serie_id.localeCompare(b.serie_id))) {
    const lat = coordenada(m.meta?.lat);
    const lon = coordenada(m.meta?.lon);
    const cambio = m.cambio_pct ?? m.cambio;
    if (lat === null || lon === null || cambio === null) continue;
    const dir = direccion(cambio);
    const tipo: TipoPin = dir === "sube" ? "sube" : dir === "baja" ? "baja" : "igual";
    const id = `${tipo}:${lat.toFixed(2)},${lon.toFixed(2)}`;
    const lugar = typeof m.meta?.pais === "string" ? m.meta.pais : m.nombre_corto;
    const pin = grupos.get(id) ?? { id, tipo, lugar, lat, lon, elementos: [] };
    const flecha = dir === "sube" ? "↑" : dir === "baja" ? "↓" : "→";
    const texto = m.cambio_pct !== null ? `${m.nombre_corto} ${flecha} ${cifraConSigno(m.cambio_pct, 2)}%` : `${m.nombre_corto} ${flecha} ${cifraConSigno(m.cambio!, 2)}`;
    pin.elementos.push({ texto, url: m.url_dato ?? m.fuente_url, detalle: `${m.fuente_nombre} · dato del ${m.fecha_dato}` });
    grupos.set(id, pin);
  }
  return [...grupos.values()];
}
