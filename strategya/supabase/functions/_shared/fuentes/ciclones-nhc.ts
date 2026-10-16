// Adaptado de God's Eye View (MIT, © 2026 Bilawal Sidhu) — server/providers/cyclones.js
// (parseCycloneStatus, attachCycloneGeometry y la consulta al MapServer de resumen tropical).
// Portado a TypeScript estricto. Cambios: los números se leen exactos (jsonExacto) y se guardan como texto;
// los rótulos van en español; la salida son filas de mercado.eventos_geo.
//
// NOAA / NWS · National Hurricane Center. Datos públicos (https://www.weather.gov/disclaimer).
// Estado: https://www.nhc.noaa.gov/CurrentStorms.json
// Pronóstico: https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather_summary/MapServer
// Cobertura: Atlántico y Pacífico norte oriental/central; no es una cobertura mundial de ciclones.
// Muestras de prueba: pruebas/muestras/nhc/ (SINTÉTICAS; ver sondas/lotes/27-globo.txt).

import { aDecimal, jsonExacto } from "../json.ts";
import type { Tarea } from "../ingesta.ts";
import type { FilaEventoGeo } from "./sismos-usgs.ts";

export const URL_ESTADO_NHC = "https://www.nhc.noaa.gov/CurrentStorms.json";
export const URL_GIS_NHC =
  "https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather_summary/MapServer";
export const COBERTURA_NHC = "Atlántico y Pacífico norte oriental/central; no es una cobertura mundial.";

const HORA = 3_600_000;

/** Capas del MapServer: 5 = puntos del pronóstico, 6 = trayectoria, 7 = cono (las mismas de God's Eye View). */
export const CAPAS_GIS = [
  { id: 5, cuenta: 500, tipo: "puntos" },
  { id: 6, cuenta: 32, tipo: "trayectoria" },
  { id: 7, cuenta: 32, tipo: "cono" },
] as const;

export type Posicion = { lon: number; lat: number };

export interface Geometria {
  type: "Point" | "LineString" | "MultiLineString" | "Polygon" | "MultiPolygon";
  // deno-lint-ignore no-explicit-any
  coordinates: any;
}

export interface PuntoPronostico {
  lat: string;
  lon: string;
  horas: number;
  viento_kt: string | null;
  rafaga_kt: string | null;
}

export interface Ciclon {
  id: string;
  nombre: string;
  clasificacion: string;
  cuenca: string;
  lat: string;
  lon: string;
  posicionEn: string;
  avisoNumero: string;
  emitidoEn: string;
  vientoKt: string | null;
  presionHpa: string | null;
  movimiento: { direccionGrados: string | null; velocidadKt: string | null };
  urlAviso: string | null;
  urlPerspectiva: string;
  geometria: "pendiente" | "vigente" | "no_disponible";
  puntos: PuntoPronostico[];
  trayectoria: Geometria | null;
  cono: Geometria | null;
}

export class ErrorDatosNhc extends Error {
  constructor(motivo = "datos del NHC con formato inesperado") {
    super(motivo);
    this.name = "ErrorDatosNhc";
  }
}

const invalido = (motivo?: string): never => {
  throw new ErrorDatosNhc(motivo);
};

function texto(v: unknown, max = 80): string {
  if (typeof v !== "string" || !v.trim() || v.length > max || /[\u0000-\u001f<>]/.test(v)) return invalido("texto inválido");
  return v.trim();
}

function aviso(v: unknown): string {
  if (typeof v !== "string" || !/^\d{1,3}[A-Z]?$/i.test(v)) return invalido("número de aviso inválido");
  return v.replace(/^0+(?=\d)/, "").toUpperCase();
}

/** Número dentro de un rango, como texto exacto; null si falta o está fuera de rango (no se inventa). */
function numero(v: unknown, min: number, max: number): string | null {
  if (v === null || v === undefined || v === "") return null;
  const d = aDecimal(v);
  if (d === null) return null;
  const n = Number(d);
  return n >= min && n <= max ? d : null;
}

function iso(v: unknown, ahora: number): string {
  if (typeof v !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v)) return invalido("fecha inválida");
  const n = Date.parse(v);
  if (
    !Number.isFinite(n) ||
    n > ahora + 5 * 60_000 ||
    ahora - n > 12 * HORA ||
    new Date(n).toISOString().replace(".000Z", "Z") !== v.replace(".000Z", "Z")
  ) {
    return invalido("fecha fuera de la ventana de 12 h o inexistente");
  }
  return new Date(n).toISOString();
}

function posicion(c: unknown): Posicion {
  if (!Array.isArray(c) || c.length !== 2) return invalido("posición inválida");
  const lon = aDecimal(c[0]);
  const lat = aDecimal(c[1]);
  if (lon === null || lat === null || Math.abs(Number(lon)) > 180 || Math.abs(Number(lat)) > 90) {
    return invalido("posición fuera de rango");
  }
  return { lon: Number(lon), lat: Number(lat) };
}

function enlaceOficial(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 256) return null;
  try {
    const u = new URL(v);
    return u.origin === "https://www.nhc.noaa.gov" && !u.username && !u.password && !u.search && !u.hash &&
        /^\/text\/[A-Z0-9]+\.shtml$/.test(u.pathname)
      ? u.href
      : null;
  } catch {
    return null;
  }
}

/**
 * Estado de los ciclones activos. Rechaza (no reporta vacío) un documento mal formado, con ids repetidos,
 * más de 32 tormentas o avisos de más de 12 h: «sin ciclones» solo se dice cuando el NHC lo dice.
 */
export function parsearEstadoCiclones(cuerpo: string, ahora: number): Ciclon[] {
  let doc: unknown;
  try {
    doc = jsonExacto(cuerpo);
  } catch {
    return invalido("CurrentStorms.json no es JSON");
  }
  // deno-lint-ignore no-explicit-any
  const d = doc as any;
  if (!Array.isArray(d?.activeStorms) || d.activeStorms.length > 32) return invalido("falta activeStorms");
  const vistos = new Set<string>();
  // deno-lint-ignore no-explicit-any
  return (d.activeStorms as any[]).map((raw) => {
    if (typeof raw?.id !== "string" || !/^(?:al|ep|cp)\d{6}$/.test(raw.id) || vistos.has(raw.id)) {
      return invalido("id de tormenta inválido o repetido");
    }
    vistos.add(raw.id);
    const f = raw.forecastAdvisory;
    const emitidoEn = iso(f?.issuance, ahora);
    const avisoNumero = aviso(f?.advNum);
    const posicionEn = iso(raw.lastUpdate, ahora);
    posicion([raw.longitudeNumeric, raw.latitudeNumeric]); // valida rango; se guarda el texto exacto
    const cuenca = raw.id.slice(0, 2);
    return {
      id: raw.id,
      nombre: texto(raw.name),
      clasificacion: texto(raw.classification, 16),
      cuenca: cuenca.toUpperCase(),
      lat: aDecimal(raw.latitudeNumeric)!,
      lon: aDecimal(raw.longitudeNumeric)!,
      posicionEn,
      avisoNumero,
      emitidoEn,
      vientoKt: numero(raw.intensity, 0, 300),
      presionHpa: numero(raw.pressure, 800, 1100),
      movimiento: { direccionGrados: numero(raw.movementDir, 0, 360), velocidadKt: numero(raw.movementSpeed, 0, 200) },
      urlAviso: enlaceOficial(f?.url),
      urlPerspectiva: `https://www.nhc.noaa.gov/gtwo.php?basin=${cuenca === "al" ? "atlc" : cuenca === "cp" ? "cpac" : "epac"}&fdays=7`,
      geometria: "pendiente",
      puntos: [],
      trayectoria: null,
      cono: null,
    } satisfies Ciclon;
  });
}

function geometria(raw: unknown, tipo: (typeof CAPAS_GIS)[number]["tipo"], presupuesto: { n: number }): Geometria {
  const tipos = tipo === "puntos" ? ["Point"] : tipo === "trayectoria" ? ["LineString", "MultiLineString"] : ["Polygon", "MultiPolygon"];
  // deno-lint-ignore no-explicit-any
  const g = raw as any;
  if (!tipos.includes(g?.type)) return invalido("geometría de tipo inesperado");
  const punto = (v: unknown): [number, number] => {
    const p = posicion(v);
    if (++presupuesto.n > 25_000) invalido("geometría demasiado grande");
    return [p.lon, p.lat];
  };
  const linea = (v: unknown, anillo = false): [number, number][] => {
    if (!Array.isArray(v) || v.length < (anillo ? 4 : 2) || v.length > 10_000) return invalido("línea inválida");
    const r = v.map(punto);
    if (anillo && (r[0][0] !== r.at(-1)![0] || r[0][1] !== r.at(-1)![1])) invalido("anillo sin cerrar");
    return r;
  };
  const lista = <T>(v: unknown, leer: (x: unknown) => T): T[] => {
    if (!Array.isArray(v) || !v.length || v.length > 128) return invalido("lista de geometrías inválida");
    return v.map(leer);
  };
  const poligono = (v: unknown) => lista(v, (anillo) => linea(anillo, true));
  const coordinates = g.type === "Point"
    ? punto(g.coordinates)
    : g.type === "LineString"
    ? linea(g.coordinates)
    : g.type === "MultiLineString"
    ? lista(g.coordinates, (parte) => linea(parte))
    : g.type === "Polygon"
    ? poligono(g.coordinates)
    : lista(g.coordinates, poligono);
  return { type: g.type, coordinates };
}

/**
 * Une la geometría del pronóstico a cada tormenta, solo si pertenece al MISMO número de aviso:
 * nunca se rotula una geometría vieja con el aviso nuevo.
 */
export function unirGeometria(ciclones: Ciclon[], colecciones: string[]): Ciclon[] {
  const presupuesto = { n: 0 };
  const leidas = CAPAS_GIS.map((capa, i) => {
    let doc: unknown;
    try {
      doc = jsonExacto(colecciones[i]);
    } catch {
      return invalido("capa GIS no es JSON");
    }
    // deno-lint-ignore no-explicit-any
    const c = doc as any;
    if (c?.type !== "FeatureCollection" || c.exceededTransferLimit || !Array.isArray(c.features) || c.features.length > capa.cuenta) {
      return invalido("capa GIS inválida");
    }
    // deno-lint-ignore no-explicit-any
    return (c.features as any[]).map((feature) => {
      if (feature?.type !== "Feature") return invalido("entrada GIS inválida");
      const p = feature.properties;
      const origen = typeof p?.idp_source === "string" &&
        p.idp_source.match(/^((?:al|ep|cp)\d{6})-(\d{1,3}[a-z]?)_5day_(pts|lin|pgn)$/i);
      if (!origen || origen[3].toLowerCase() !== ["pts", "lin", "pgn"][i]) return invalido("idp_source inesperado");
      const adv = aviso(p.advisnum === undefined ? undefined : String(p.advisnum));
      if (adv !== aviso(origen[2])) return invalido("aviso de la geometría no coincide");
      return {
        id: origen[1].toLowerCase(),
        aviso: adv,
        geometria: geometria(feature.geometry, capa.tipo, presupuesto),
        horas: numero(p.tau, 0, 168),
        viento: numero(p.maxwind, 0, 300),
        rafaga: numero(p.gust, 0, 350),
      };
    });
  });
  return ciclones.map((c) => {
    const grupos = leidas.map((items) => items.filter((it) => it.id === c.id && it.aviso === c.avisoNumero));
    if (grupos[1].length > 1 || grupos[2].length > 1) return invalido("geometría duplicada");
    if (!grupos[0].length || grupos[1].length !== 1 || grupos[2].length !== 1) return c;
    const horasVistas = new Set<string>();
    const puntos = grupos[0]
      .map((it) => {
        if (it.horas === null || horasVistas.has(it.horas)) return invalido("punto de pronóstico sin hora o repetido");
        horasVistas.add(it.horas);
        const [lon, lat] = it.geometria.coordinates as [number, number];
        return { lat: String(lat), lon: String(lon), horas: Number(it.horas), viento_kt: it.viento, rafaga_kt: it.rafaga };
      })
      .sort((a, b) => a.horas - b.horas);
    return { ...c, geometria: "vigente", puntos, trayectoria: grupos[1][0].geometria, cono: grupos[2][0].geometria };
  });
}

export function urlCapaGis(id: number, tipo: (typeof CAPAS_GIS)[number]["tipo"], cuenta: number): string {
  const q = new URLSearchParams({
    where: "1=1",
    outFields: tipo === "puntos" ? "idp_source,advisnum,tau,maxwind,gust" : "idp_source,advisnum",
    outSR: "4326",
    resultRecordCount: String(cuenta),
    geometryPrecision: "4",
    f: "geojson",
  });
  return `${URL_GIS_NHC}/${id}/query?${q.toString()}`;
}

/** Nombre en español de la clasificación del NHC. */
export function clasificacionEs(c: string): string {
  const m: Record<string, string> = {
    HU: "Huracán",
    TS: "Tormenta tropical",
    TD: "Depresión tropical",
    STS: "Tormenta subtropical",
    SD: "Depresión subtropical",
    STD: "Depresión subtropical",
    PTC: "Ciclón tropical potencial",
    PC: "Ciclón postropical",
    TY: "Tifón",
  };
  return m[c.toUpperCase()] ?? c;
}

export function filaCiclon(c: Ciclon): FilaEventoGeo {
  return {
    tipo: "ciclon",
    id_externo: c.id,
    titulo: `${clasificacionEs(c.clasificacion)} ${c.nombre}`,
    lat: c.lat,
    lon: c.lon,
    magnitud: c.vientoKt,
    fecha_evento: c.posicionEn,
    url: c.urlAviso ?? c.urlPerspectiva,
    datos: {
      nombre: c.nombre,
      clasificacion: c.clasificacion,
      cuenca: c.cuenca,
      aviso: c.avisoNumero,
      emitido: c.emitidoEn,
      viento_kt: c.vientoKt,
      presion_hpa: c.presionHpa,
      movimiento: { direccion_grados: c.movimiento.direccionGrados, velocidad_kt: c.movimiento.velocidadKt },
      url_aviso: c.urlAviso,
      url_perspectiva: c.urlPerspectiva,
      geometria: c.geometria,
      puntos: c.puntos,
      trayectoria: c.trayectoria,
      cono: c.cono,
      cobertura: COBERTURA_NHC,
    },
    fuente_id: "nhc",
  };
}

export const tareaCiclonesNhc: Tarea = {
  nombre: "ciclones-nhc",
  fuenteId: "nhc",
  async ejecutar(ctx) {
    const r = await ctx.obtener(URL_ESTADO_NHC);
    let ciclones = parsearEstadoCiclones(r.texto, ctx.ahora.getTime());
    const advertencias: string[] = [];
    if (ciclones.length) {
      try {
        const capas: string[] = [];
        for (const capa of CAPAS_GIS) capas.push((await ctx.obtener(urlCapaGis(capa.id, capa.tipo, capa.cuenta))).texto);
        ciclones = unirGeometria(ciclones, capas);
      } catch (e) {
        ciclones = ciclones.map((c) => ({ ...c, geometria: "no_disponible" }));
        advertencias.push(`Pronóstico (cono y trayectoria) no disponible: ${(e as Error).message}`);
      }
    }
    const filas = ciclones.map(filaCiclon);
    const fila = await ctx.rpc<{ vigentes?: number; borrados?: number } | null>("globo_reemplazar_ciclones", { p_filas: filas });
    return {
      parcial: advertencias.length > 0,
      advertencias,
      detalle: {
        activos: ciclones.length,
        ids: ciclones.map((c) => c.id),
        borrados: fila?.borrados ?? null,
        consultado: ctx.ahora.toISOString(),
      },
    };
  },
};
