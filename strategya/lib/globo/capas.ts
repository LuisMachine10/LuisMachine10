// Arma las capas del globo a partir de filas de la base. Función pura: no lee red ni base, no inventa.
// Si un dato no está, el punto lo dice («sin datos», «no confirmado»); nunca se rellena.

import type { DatosSello } from "../../componentes/SelloFuente";
import { cifra, cifraConSigno, direccion, type Direccion, fechaCorta, horaRD, ZONA_RD } from "../formato";
import { frescura } from "../frescura";
import { distanciaKm, distanciaMinimaKm, kmParaMostrar, type Punto, SANTO_DOMINGO, sismoRelevante } from "./geo";
import { type EnlaceFuente, PASOS, type PasoMaritimo } from "./pasos";

// ---------------------------------------------------------------------------
// Filas de entrada (lo que devuelve lib/datos-globo.ts; números como texto)
// ---------------------------------------------------------------------------

export interface SerieGlobo {
  id: string;
  nombre: string;
  nombre_corto: string;
  categoria: string;
  unidad: string;
  fuente_id: string;
  max_antiguedad_min: number;
  orden: number;
  meta: Record<string, unknown>;
}

export interface ObservacionGlobo {
  serie_id: string;
  valor: string;
  cambio: string | null;
  cambio_pct: string | null;
  fecha_dato: string;
  hora_dato: string | null;
  recogido_en: string;
  url_dato: string | null;
  estado: string;
}

export interface FuenteGlobo {
  id: string;
  nombre: string;
  url: string;
}

export interface NoticiaGlobo {
  id: number;
  titular: string;
  url: string;
  medio: string;
  fecha: string;
  categoria: "mercado" | "guerra" | "rd" | "instituciones";
  lat: string | null;
  lon: string | null;
  pais: string | null;
}

export interface EventoGlobo {
  id: number;
  tipo: "sismo" | "ciclon";
  id_externo: string;
  titulo: string;
  lat: string;
  lon: string;
  magnitud: string | null;
  fecha_evento: string;
  url: string;
  datos: Record<string, unknown>;
  recogido_en: string;
}

export interface TareaGlobo {
  tarea: string;
  estado: string;
  inicio: string;
  ultima_ok: string | null;
  error: string | null;
  detalle: Record<string, unknown> | null;
}

export interface EntradaCapas {
  ahora: Date;
  series: SerieGlobo[];
  /** La observación más reciente de cada serie (a lo sumo una por serie). */
  ultimas: ObservacionGlobo[];
  fuentes: FuenteGlobo[];
  noticias: NoticiaGlobo[];
  eventos: EventoGlobo[];
  tareas: TareaGlobo[];
  pasos?: readonly PasoMaritimo[];
}

// ---------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------

export type CapaId = "mercados" | "noticias" | "rd" | "pasos" | "sismos" | "ciclones" | "buques";

export const CAPAS: readonly { id: CapaId; nombre: string; porDefecto: boolean }[] = [
  { id: "mercados", nombre: "Mercados", porDefecto: true },
  { id: "noticias", nombre: "Noticias y guerras", porDefecto: true },
  { id: "rd", nombre: "República Dominicana", porDefecto: true },
  { id: "pasos", nombre: "Pasos marítimos", porDefecto: true },
  { id: "sismos", nombre: "Sismos (USGS)", porDefecto: true },
  { id: "ciclones", nombre: "Ciclones (NHC)", porDefecto: true },
  { id: "buques", nombre: "Buques en pasos (AIS)", porDefecto: false },
];

/** Tono del marcador. Cada uno se pinta con una variable de app/globals.css (ver estilos/globo.css). */
export type Tono = "sube" | "baja" | "neutro" | "guerra" | "ambar" | "rd" | "sismo" | "ciclon" | "paso" | "buques";

export interface CifraPunto {
  etiqueta: string;
  /** Texto ya formateado; null = no confirmado. */
  valor: string | null;
  unidad?: string;
  /** Cambio formateado con flecha y signo (p. ej. «↑ +0.45%»). */
  cambio?: string | null;
  direccion?: Direccion;
  sello: DatosSello | null;
  enlace?: EnlaceFuente;
}

export interface PuntoGlobo {
  id: string;
  capa: CapaId;
  lat: number;
  lon: number;
  tono: Tono;
  titulo: string;
  /** Qué es el punto, en una frase. */
  que: string;
  cifras: CifraPunto[];
  enlaces: EnlaceFuente[];
  notas: string[];
  /** Resaltado (sismo cerca de una zona vigilada, ciclón cerca de RD, paso con alerta). */
  destacado: boolean;
  /** Momento del dato o del evento (ISO), si aplica. */
  momento?: string;
  /** Trayectorias (ciclón) como listas de puntos. */
  lineas?: Punto[][];
  /** Áreas (cono del ciclón): anillos exteriores. */
  areas?: Punto[][];
}

export interface EstadoCapa {
  id: CapaId;
  nombre: string;
  puntos: number;
  /** Mensaje cuando no hay puntos o hay algo que advertir. */
  mensaje: string | null;
}

export interface CiclonResumen {
  id: string;
  titulo: string;
  distanciaKm: number | null;
  /** «pronóstico» si se midió con la trayectoria oficial; «posición actual» si no hubo pronóstico. */
  base: "pronóstico" | "posición actual";
  url: string;
  avisoEmitido: string | null;
}

export interface AlertaPaso {
  paso: PasoMaritimo;
  motivos: string[];
}

export interface ResumenGlobo {
  sismosRelevantes: PuntoGlobo[];
  ciclones: CiclonResumen[];
  ciclonesConsultadoEn: string | null;
  ciclonesTareaFallo: boolean;
  pasosConAlerta: AlertaPaso[];
}

export interface Capas {
  puntos: PuntoGlobo[];
  estados: Record<CapaId, EstadoCapa>;
  resumen: ResumenGlobo;
}

// ---------------------------------------------------------------------------
// Ayudas
// ---------------------------------------------------------------------------

const FLECHA: Record<Direccion, string> = { sube: "↑", baja: "↓", igual: "→" };
const HORA_MS = 3_600_000;

/** Fecha AAAA-MM-DD del instante en hora de RD. */
export function fechaRD(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_RD, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function num(t: string | null | undefined): number | null {
  if (t === null || t === undefined || t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Decimales a mostrar: los de la fuente, entre `min` y `max`. */
function decimales(t: string, min = 2, max = 4): number {
  const d = t.includes(".") ? t.split(".")[1].length : 0;
  return Math.min(max, Math.max(min, d));
}

function nombreFuente(fuentes: FuenteGlobo[], id: string): FuenteGlobo {
  return fuentes.find((f) => f.id === id) ?? { id, nombre: id, url: "" };
}

function tarea(tareas: TareaGlobo[], nombre: string): TareaGlobo | null {
  return tareas.find((t) => t.tarea === nombre) ?? null;
}

/** ¿La última lectura buena de la tarea es más vieja que `maxMin`? Sin lectura buena = desactualizado. */
function tareaVencida(t: TareaGlobo | null, maxMin: number, ahora: Date): boolean {
  if (!t?.ultima_ok) return true;
  return ahora.getTime() - new Date(t.ultima_ok).getTime() > maxMin * 60_000;
}

function cifraSerie(s: SerieGlobo, o: ObservacionGlobo | undefined, fuentes: FuenteGlobo[], ahora: Date): CifraPunto {
  const f = nombreFuente(fuentes, s.fuente_id);
  if (!o) return { etiqueta: s.nombre_corto, valor: null, unidad: s.unidad, sello: null, enlace: f.url ? { titulo: f.nombre, url: f.url } : undefined };
  const dir = direccion(o.cambio_pct ?? o.cambio);
  const cambio = o.cambio_pct !== null
    ? `${FLECHA[dir]} ${cifraConSigno(o.cambio_pct, 2)}%`
    : o.cambio !== null
    ? `${FLECHA[dir]} ${cifraConSigno(o.cambio, decimales(o.cambio))}`
    : null;
  return {
    etiqueta: s.nombre_corto,
    valor: cifra(o.valor, s.unidad === "%" ? 2 : s.unidad === "buques" ? 0 : decimales(o.valor)),
    unidad: s.unidad,
    cambio,
    direccion: cambio ? dir : undefined,
    sello: {
      fuente: f.nombre,
      url: o.url_dato ?? (f.url || null),
      fechaDato: o.fecha_dato,
      verificadoEn: o.recogido_en,
      desactualizado: o.estado === "desactualizado" || frescura(o, s.max_antiguedad_min, ahora).desactualizado,
      ultimaCorridaFallo: false,
    },
  };
}

// ---------------------------------------------------------------------------
// Capas
// ---------------------------------------------------------------------------

function capaMercados(e: EntradaCapas, porSerie: Map<string, ObservacionGlobo>): PuntoGlobo[] {
  const grupos = new Map<string, SerieGlobo[]>();
  for (const s of [...e.series].sort((a, b) => a.orden - b.orden)) {
    if (s.categoria === "rd" || s.fuente_id === "aisstream") continue;
    const lat = num(String(s.meta.lat ?? ""));
    const lon = num(String(s.meta.lon ?? ""));
    if (lat === null || lon === null) continue;
    const clave = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave)!.push(s);
  }
  const puntos: PuntoGlobo[] = [];
  for (const [clave, series] of grupos) {
    const [lat, lon] = clave.split(",").map(Number);
    const cifras = series.map((s) => cifraSerie(s, porSerie.get(s.id), e.fuentes, e.ahora));
    const principal = cifras.find((c) => c.valor !== null);
    const tono: Tono = !principal?.direccion ? "neutro" : principal.direccion === "sube" ? "sube" : principal.direccion === "baja" ? "baja" : "neutro";
    const lugar = String(series[0].meta.bolsa ?? series[0].meta.pais ?? series[0].nombre);
    puntos.push({
      id: `mercados:${clave}`,
      capa: "mercados",
      lat,
      lon,
      tono,
      titulo: lugar,
      que: `Bolsa o mercado: ${series.map((s) => s.nombre_corto).join(", ")}. Color según ${principal?.etiqueta ?? series[0].nombre_corto} en el día.`,
      cifras,
      enlaces: [],
      notas: principal ? [] : ["Sin datos todavía de estas series."],
      destacado: false,
      momento: principal?.sello?.verificadoEn ?? undefined,
    });
  }
  return puntos;
}

const TONO_NOTICIA: Record<NoticiaGlobo["categoria"], Tono> = { guerra: "guerra", mercado: "ambar", instituciones: "ambar", rd: "rd" };
const QUE_NOTICIA: Record<NoticiaGlobo["categoria"], string> = {
  guerra: "Noticia de guerra o conflicto",
  mercado: "Noticia de mercados",
  instituciones: "Comunicado o noticia de una institución",
  rd: "Noticia de República Dominicana",
};

function capaNoticias(e: EntradaCapas): PuntoGlobo[] {
  const desde = e.ahora.getTime() - 48 * HORA_MS;
  return e.noticias
    .filter((n) => new Date(n.fecha).getTime() >= desde && num(n.lat) !== null && num(n.lon) !== null)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .map((n) => ({
      id: `noticias:${n.id}`,
      capa: "noticias" as const,
      lat: num(n.lat)!,
      lon: num(n.lon)!,
      tono: TONO_NOTICIA[n.categoria],
      titulo: n.titular,
      que: `${QUE_NOTICIA[n.categoria]}${n.pais ? ` · ${n.pais}` : ""}`,
      cifras: [],
      enlaces: [{ titulo: `Leer en ${n.medio}`, url: n.url }],
      notas: [`${n.medio} · ${fechaCorta(fechaRD(n.fecha), false)}, ${horaRD(n.fecha)} (hora RD)`],
      destacado: n.categoria === "guerra",
      momento: n.fecha,
    }));
}

function capaRd(e: EntradaCapas, porSerie: Map<string, ObservacionGlobo>): PuntoGlobo {
  const ids = ["USDDOP_VENTA", "TPM_BCRD"];
  const cifras = ids.map((id) => {
    const s = e.series.find((x) => x.id === id);
    if (!s) return { etiqueta: id === "TPM_BCRD" ? "TPM" : "US$ venta", valor: null, sello: null } satisfies CifraPunto;
    return cifraSerie(s, porSerie.get(id), e.fuentes, e.ahora);
  });
  const sinDatos = cifras.filter((c) => c.valor === null).map((c) => c.etiqueta);
  return {
    id: "rd:santo-domingo",
    capa: "rd",
    lat: SANTO_DOMINGO.lat,
    lon: SANTO_DOMINGO.lon,
    tono: "rd",
    titulo: "República Dominicana · Santo Domingo",
    que: "Dólar del Banco Central (venta) y tasa de política monetaria.",
    cifras,
    enlaces: [{ titulo: "Banco Central de la República Dominicana", url: "https://www.bancentral.gov.do/" }],
    notas: sinDatos.length ? [`No confirmado: ${sinDatos.join(", ")} (sin dato guardado todavía).`] : [],
    destacado: true,
  };
}

function capaPasos(e: EntradaCapas, alertas: AlertaPaso[], porSerie: Map<string, ObservacionGlobo>): PuntoGlobo[] {
  return (e.pasos ?? PASOS).map((p) => {
    const alerta = alertas.find((a) => a.paso.id === p.id);
    const cifras = p.series
      .map((id) => e.series.find((s) => s.id === id))
      .filter((s): s is SerieGlobo => !!s)
      .map((s) => cifraSerie(s, porSerie.get(s.id), e.fuentes, e.ahora));
    return {
      id: `pasos:${p.id}`,
      capa: "pasos" as const,
      lat: p.lat,
      lon: p.lon,
      tono: alerta ? "ambar" : "paso",
      titulo: p.nombre,
      que: `Paso marítimo crítico. ${p.materias}`,
      cifras,
      enlaces: [p.fuente],
      notas: [p.relevancia, ...(alerta ? alerta.motivos.map((m) => `Alerta: ${m}`) : [])],
      destacado: !!alerta,
    };
  });
}

function capaSismos(e: EntradaCapas): PuntoGlobo[] {
  const t = tarea(e.tareas, "sismos-usgs");
  const vencida = tareaVencida(t, 60, e.ahora);
  const desde = e.ahora.getTime() - 7 * 24 * HORA_MS;
  return e.eventos
    .filter((ev) => ev.tipo === "sismo" && new Date(ev.fecha_evento).getTime() >= desde)
    .sort((a, b) => b.fecha_evento.localeCompare(a.fecha_evento))
    .map((ev) => {
      const lat = Number(ev.lat);
      const lon = Number(ev.lon);
      const cerca = sismoRelevante({ lat, lon }, num(ev.magnitud));
      const d = ev.datos as { lugar?: string | null; profundidad_km?: string | null; tipo_magnitud?: string | null; alerta_pager?: string | null; tsunami?: boolean };
      const notas: string[] = [];
      for (const c of cerca) notas.push(`A unos ${kmParaMostrar(c.distanciaKm)} km del centro de la zona «${c.zona.nombre}» (${c.zona.motivo}). Zona definida por Strategya.`);
      if (d.profundidad_km) notas.push(`Profundidad: ${cifra(d.profundidad_km, 1)} km.`);
      if (d.alerta_pager) notas.push(`Alerta PAGER de USGS: ${d.alerta_pager}.`);
      if (d.tsunami) notas.push("USGS marca este evento en una región con posible tsunami: consulte el aviso oficial.");
      return {
        id: `sismos:${ev.id_externo}`,
        capa: "sismos" as const,
        lat,
        lon,
        tono: cerca.length ? "ambar" : "sismo",
        titulo: ev.titulo,
        que: `Sismo${d.lugar ? ` · ${d.lugar}` : ""} · ${fechaCorta(fechaRD(ev.fecha_evento), false)}, ${horaRD(ev.fecha_evento)} (hora RD)`,
        cifras: [
          {
            etiqueta: "Magnitud",
            valor: ev.magnitud === null ? null : cifra(ev.magnitud, 1),
            unidad: d.tipo_magnitud ?? undefined,
            sello: {
              fuente: "USGS",
              url: ev.url,
              fechaDato: fechaRD(ev.fecha_evento),
              verificadoEn: t?.ultima_ok ?? ev.recogido_en,
              desactualizado: vencida,
              ultimaCorridaFallo: t?.estado === "error",
            },
          },
        ],
        enlaces: [{ titulo: "Página oficial del evento (USGS)", url: ev.url }],
        notas,
        destacado: cerca.length > 0,
        momento: ev.fecha_evento,
      };
    });
}

function puntosLinea(g: unknown): Punto[][] {
  // deno-lint-ignore no-explicit-any
  const geo = g as any;
  const par = (c: unknown): Punto | null => (Array.isArray(c) && c.length >= 2 && Number.isFinite(Number(c[0])) && Number.isFinite(Number(c[1])) ? { lon: Number(c[0]), lat: Number(c[1]) } : null);
  const lista = (cs: unknown): Punto[] => (Array.isArray(cs) ? cs.map(par).filter((p): p is Punto => p !== null) : []);
  if (geo?.type === "LineString") return [lista(geo.coordinates)];
  if (geo?.type === "MultiLineString" && Array.isArray(geo.coordinates)) return geo.coordinates.map(lista);
  if (geo?.type === "Polygon" && Array.isArray(geo.coordinates)) return [lista(geo.coordinates[0])];
  if (geo?.type === "MultiPolygon" && Array.isArray(geo.coordinates)) return geo.coordinates.map((p: unknown[]) => lista(p?.[0]));
  return [];
}

export interface DistanciaCiclon {
  km: number | null;
  base: "pronóstico" | "posición actual";
}

/**
 * Distancia mínima a Santo Domingo: de la trayectoria y los puntos del pronóstico oficial si existen;
 * si no, de la posición actual. Geometría calculada por Strategya sobre los datos del NHC.
 */
export function distanciaCiclonASantoDomingo(ev: Pick<EventoGlobo, "lat" | "lon" | "datos">): DistanciaCiclon {
  const d = ev.datos as { geometria?: string; trayectoria?: unknown; puntos?: { lat: string; lon: string }[] };
  const actual = { lat: Number(ev.lat), lon: Number(ev.lon) };
  if (d.geometria === "vigente") {
    const lineas = puntosLinea(d.trayectoria).filter((l) => l.length);
    const puntos = (d.puntos ?? []).map((p) => ({ lat: Number(p.lat), lon: Number(p.lon) })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    const candidatos = [
      distanciaKm(SANTO_DOMINGO, actual),
      ...lineas.map((l) => distanciaMinimaKm(SANTO_DOMINGO, l) ?? Infinity),
      ...puntos.map((p) => distanciaKm(SANTO_DOMINGO, p)),
    ];
    return { km: Math.min(...candidatos), base: "pronóstico" };
  }
  if (!Number.isFinite(actual.lat) || !Number.isFinite(actual.lon)) return { km: null, base: "posición actual" };
  return { km: distanciaKm(SANTO_DOMINGO, actual), base: "posición actual" };
}

/** Umbral para resaltar un ciclón como cercano a RD. */
export const CICLON_CERCA_RD_KM = 500;

function capaCiclones(e: EntradaCapas): { puntos: PuntoGlobo[]; resumen: CiclonResumen[] } {
  const t = tarea(e.tareas, "ciclones-nhc");
  const vencida = tareaVencida(t, 120, e.ahora);
  const puntos: PuntoGlobo[] = [];
  const resumen: CiclonResumen[] = [];
  for (const ev of e.eventos.filter((x) => x.tipo === "ciclon")) {
    const d = ev.datos as {
      aviso?: string; emitido?: string; presion_hpa?: string | null; geometria?: string; cobertura?: string;
      movimiento?: { direccion_grados?: string | null; velocidad_kt?: string | null }; url_perspectiva?: string;
      trayectoria?: unknown; cono?: unknown;
    };
    const dist = distanciaCiclonASantoDomingo(ev);
    const cerca = dist.km !== null && dist.km <= CICLON_CERCA_RD_KM;
    const sello: DatosSello = {
      fuente: "NOAA NHC",
      url: ev.url,
      fechaDato: fechaRD(d.emitido ?? ev.fecha_evento),
      verificadoEn: t?.ultima_ok ?? ev.recogido_en,
      desactualizado: vencida,
      ultimaCorridaFallo: t?.estado === "error",
    };
    const cifras: CifraPunto[] = [
      { etiqueta: "Viento máximo sostenido", valor: ev.magnitud === null ? null : cifra(ev.magnitud, 0), unidad: "nudos", sello },
    ];
    if (d.presion_hpa) cifras.push({ etiqueta: "Presión mínima", valor: cifra(d.presion_hpa, 0), unidad: "hPa", sello });
    if (dist.km !== null) {
      cifras.push({
        etiqueta: `Distancia mínima a Santo Domingo (${dist.base})`,
        valor: `≈ ${kmParaMostrar(dist.km)}`,
        unidad: "km",
        sello: { ...sello, fuente: "Cálculo de Strategya con datos del NHC" },
      });
    }
    const notas: string[] = [];
    if (d.aviso) notas.push(`Aviso n.º ${d.aviso}${d.emitido ? `, emitido ${fechaCorta(fechaRD(d.emitido), false)} a las ${horaRD(d.emitido)} (hora RD)` : ""}.`);
    if (d.movimiento?.direccion_grados && d.movimiento.velocidad_kt) {
      notas.push(`Movimiento: hacia ${d.movimiento.direccion_grados}° a ${d.movimiento.velocidad_kt} nudos.`);
    }
    if (d.geometria !== "vigente") notas.push("Pronóstico (cono y trayectoria) no disponible para este aviso: la distancia se mide desde la posición actual.");
    notas.push("La distancia es aproximada y no reemplaza los avisos oficiales del NHC ni del COE/ONAMET.");
    if (d.cobertura) notas.push(`Cobertura del NHC: ${d.cobertura}`);
    puntos.push({
      id: `ciclones:${ev.id_externo}`,
      capa: "ciclones",
      lat: Number(ev.lat),
      lon: Number(ev.lon),
      tono: cerca ? "baja" : "ciclon",
      titulo: ev.titulo,
      que: "Ciclón tropical activo según el Centro Nacional de Huracanes (NOAA).",
      cifras,
      enlaces: [
        { titulo: "Aviso oficial (NHC)", url: ev.url },
        ...(d.url_perspectiva && d.url_perspectiva !== ev.url ? [{ titulo: "Perspectiva tropical de 7 días (NHC)", url: d.url_perspectiva }] : []),
      ],
      notas,
      destacado: cerca,
      momento: ev.fecha_evento,
      lineas: d.geometria === "vigente" ? puntosLinea(d.trayectoria).filter((l) => l.length > 1) : undefined,
      areas: d.geometria === "vigente" ? puntosLinea(d.cono).filter((l) => l.length > 2) : undefined,
    });
    resumen.push({ id: ev.id_externo, titulo: ev.titulo, distanciaKm: dist.km, base: dist.base, url: ev.url, avisoEmitido: d.emitido ?? null });
  }
  resumen.sort((a, b) => (a.distanciaKm ?? Infinity) - (b.distanciaKm ?? Infinity));
  return { puntos, resumen };
}

function capaBuques(e: EntradaCapas, porSerie: Map<string, ObservacionGlobo>): PuntoGlobo[] {
  const puntos: PuntoGlobo[] = [];
  for (const p of e.pasos ?? PASOS) {
    const ids = [`AIS_${p.id}_BUQUES`, `AIS_${p.id}_TANQUEROS`, `AIS_${p.id}_CARGA`];
    const series = ids.map((id) => e.series.find((s) => s.id === id)).filter((s): s is SerieGlobo => !!s);
    if (!series.some((s) => porSerie.has(s.id))) continue;
    const [[s, o], [n, es]] = p.cajaAis;
    const nota = String(series[0]?.meta.nota ?? "muestra de 40 s; la cobertura AIS terrestre es incompleta en alta mar");
    puntos.push({
      id: `buques:${p.id}`,
      capa: "buques",
      lat: (s + n) / 2,
      lon: (o + es) / 2,
      tono: "buques",
      titulo: `Buques AIS · ${p.nombre}`,
      que: "Conteo de buques distintos observados en la caja de vigilancia del paso durante una muestra corta.",
      cifras: series.map((x) => ({ ...cifraSerie(x, porSerie.get(x.id), e.fuentes, e.ahora), etiqueta: x.nombre.split(" · ")[0] })),
      enlaces: [{ titulo: "AISStream.io", url: "https://aisstream.io/" }],
      notas: [`Nota: ${nota}.`, "No se guardan nombres ni identificadores de buques."],
      destacado: false,
    });
  }
  return puntos;
}

/**
 * Pasos con alerta: noticias de guerra de las últimas 48 h, sismos M5+ o ciclones activos cerca del paso.
 * Las distancias son reglas fijas de Strategya (no de la fuente).
 */
export function alertasPasos(
  pasos: readonly PasoMaritimo[],
  noticias: NoticiaGlobo[],
  eventos: EventoGlobo[],
  ahora: Date,
  radios = { guerraKm: 800, sismoKm: 500, ciclonKm: 500 },
): AlertaPaso[] {
  const desde = ahora.getTime() - 48 * HORA_MS;
  const guerras = noticias.filter((n) => n.categoria === "guerra" && new Date(n.fecha).getTime() >= desde && num(n.lat) !== null && num(n.lon) !== null);
  const alertas: AlertaPaso[] = [];
  for (const p of pasos) {
    const motivos: string[] = [];
    const g = guerras.filter((n) => distanciaKm(p, { lat: num(n.lat)!, lon: num(n.lon)! }) <= radios.guerraKm);
    if (g.length) motivos.push(`${g.length === 1 ? "1 noticia" : `${g.length} noticias`} de guerra o conflicto a menos de ${radios.guerraKm} km (últimas 48 h)`);
    const sismos = eventos.filter(
      (ev) => ev.tipo === "sismo" && (num(ev.magnitud) ?? 0) >= 5 && new Date(ev.fecha_evento).getTime() >= desde &&
        distanciaKm(p, { lat: Number(ev.lat), lon: Number(ev.lon) }) <= radios.sismoKm,
    );
    if (sismos.length) motivos.push(`sismo M5+ a menos de ${radios.sismoKm} km (últimas 48 h)`);
    const ciclones = eventos.filter((ev) => {
      if (ev.tipo !== "ciclon") return false;
      const d = ev.datos as { geometria?: string; trayectoria?: unknown };
      const actual = distanciaKm(p, { lat: Number(ev.lat), lon: Number(ev.lon) });
      const lineas = d.geometria === "vigente" ? puntosLinea(d.trayectoria) : [];
      const min = Math.min(actual, ...lineas.map((l) => distanciaMinimaKm(p, l) ?? Infinity));
      return min <= radios.ciclonKm;
    });
    if (ciclones.length) motivos.push(`ciclón activo con trayectoria a menos de ${radios.ciclonKm} km`);
    if (motivos.length) alertas.push({ paso: p, motivos });
  }
  return alertas;
}

export function armarCapas(e: EntradaCapas): Capas {
  const porSerie = new Map(e.ultimas.map((o) => [o.serie_id, o]));
  const pasos = e.pasos ?? PASOS;
  const alertas = alertasPasos(pasos, e.noticias, e.eventos, e.ahora);
  const mercados = capaMercados(e, porSerie);
  const noticias = capaNoticias(e);
  const rd = capaRd(e, porSerie);
  const pasosPts = capaPasos({ ...e, pasos }, alertas, porSerie);
  const sismos = capaSismos(e);
  const ciclones = capaCiclones(e);
  const buques = capaBuques({ ...e, pasos }, porSerie);

  const tCiclones = tarea(e.tareas, "ciclones-nhc");
  const tSismos = tarea(e.tareas, "sismos-usgs");
  const tBuques = tarea(e.tareas, "buques-ais");
  const consultado = tCiclones?.ultima_ok ?? null;
  const momento = (iso: string) => `${fechaCorta(fechaRD(iso), false)}, ${horaRD(iso)} (hora RD)`;

  const nombre = (id: CapaId) => CAPAS.find((c) => c.id === id)!.nombre;
  const estado = (id: CapaId, n: number, mensaje: string | null): EstadoCapa => ({ id, nombre: nombre(id), puntos: n, mensaje });

  const estados: Record<CapaId, EstadoCapa> = {
    mercados: estado("mercados", mercados.length, mercados.length ? null : "Ninguna serie de mercado tiene coordenadas en el catálogo."),
    noticias: estado("noticias", noticias.length, noticias.length ? null : "Sin noticias con ubicación en las últimas 48 h."),
    rd: estado("rd", 1, rd.notas[0] ?? null),
    pasos: estado("pasos", pasosPts.length, alertas.length ? `${alertas.length} con alerta` : null),
    sismos: estado(
      "sismos",
      sismos.length,
      !tSismos?.ultima_ok
        ? "Sin lecturas de USGS todavía (la tarea corre cada 15 min)."
        : sismos.length
        ? null
        : `Sin sismos guardados en los últimos 7 días (USGS consultado ${momento(tSismos.ultima_ok)}).`,
    ),
    ciclones: estado(
      "ciclones",
      ciclones.puntos.length,
      ciclones.puntos.length
        ? null
        : consultado
        ? `Sin ciclones activos según NHC (consultado ${momento(consultado)}).`
        : "Sin lecturas del NHC todavía (la tarea corre cada 30 min).",
    ),
    buques: estado(
      "buques",
      buques.length,
      buques.length
        ? null
        : tBuques?.detalle && (tBuques.detalle as { desactivado?: boolean }).desactivado
        ? "Desactivado: requiere AISSTREAM_API_KEY y GLOBO_AIS_ACTIVO=1."
        : "Sin conteos AIS guardados.",
    ),
  };

  return {
    puntos: [...pasosPts, ...mercados, rd, ...ciclones.puntos, ...sismos, ...noticias, ...buques],
    estados,
    resumen: {
      sismosRelevantes: sismos.filter((s) => s.destacado),
      ciclones: ciclones.resumen,
      ciclonesConsultadoEn: consultado,
      ciclonesTareaFallo: tCiclones?.estado === "error",
      pasosConAlerta: alertas,
    },
  };
}
