// FRED (Fed de St. Louis) · cierres diarios de mercado, CSV público:
//   https://fred.stlouisfed.org/graph/fredgraph.csv?id=DJIA&cosd=AAAA-MM-DD → «observation_date,DJIA»
// Días sin dato vienen vacíos o con «.»: se saltan, nunca se rellenan.
// WTI y gas natural (Henry Hub) son series propias de FRED (FMP no las entrega con el plan de Mena).
// Dow, Nasdaq Composite y Brent son respaldo de FMP: solo se escriben si falta FMP_API_KEY, como cierre
// del día (hora = cierre de la sesión de Nueva York), para que la serie intradía tenga su último cierre.
// El proveedor «fred» de OpenBB lee las mismas series.

import type { FilaObservacion, Tarea } from "../ingesta.ts";
import { aDecimal } from "../json.ts";
import { sesionDe, sumarDias } from "../mercados.ts";
import { leerCsv } from "./tasas-politica.ts";

export interface SerieFred {
  fred: string;
  serie: string;
  /** "propia": la serie es de FRED (diaria, sin hora). "respaldo": serie intradía de FMP. */
  papel: "propia" | "respaldo";
}

export const SERIES_FRED_MERCADO: readonly SerieFred[] = [
  { fred: "DCOILWTICO", serie: "WTI", papel: "propia" },
  { fred: "DHHNGSP", serie: "GAS_NATURAL", papel: "propia" },
  { fred: "DJIA", serie: "IDX_DJI", papel: "respaldo" },
  { fred: "NASDAQCOM", serie: "IDX_IXIC", papel: "respaldo" },
  { fred: "DCOILBRENTEU", serie: "BRENT", papel: "respaldo" },
];

/** Días hacia atrás que se piden (cubre el retraso de la EIA y fines de semana largos). */
const DIAS = 21;
/** Cuántas observaciones se guardan por serie. */
const ULTIMAS = 10;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function urlFredMercado(id: string, desde: string): string {
  return `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}&cosd=${desde}`;
}
export function urlPaginaFredMercado(id: string): string {
  return `https://fred.stlouisfed.org/series/${encodeURIComponent(id)}`;
}

/** CSV de fredgraph → [{fecha, valor}] en orden, sin días vacíos. */
export function parsearCsvFredMercado(texto: string, id: string): { fecha: string; valor: string }[] {
  const tabla = leerCsv(texto);
  const cab = (tabla[0] ?? []).map((c) => c.trim());
  const col = cab.findIndex((c) => c.toUpperCase() === id.toUpperCase());
  if (!/^(observation_date|date)$/i.test(cab[0] ?? "") || col < 0) {
    throw new Error(`FRED: formato inesperado (no se encontró la columna ${id})`);
  }
  const salida: { fecha: string; valor: string }[] = [];
  for (const f of tabla.slice(1)) {
    const fecha = f[0]?.trim() ?? "";
    const valor = aDecimal((f[col] ?? "").trim());
    if (FECHA.test(fecha) && valor !== null) salida.push({ fecha, valor });
  }
  return salida.sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(-ULTIMAS);
}

export function filasFredMercado(s: SerieFred, datos: { fecha: string; valor: string }[]): FilaObservacion[] {
  return datos.map((d) => {
    const fila: FilaObservacion = {
      serie_id: s.serie,
      valor: d.valor,
      fecha_dato: d.fecha,
      url_dato: urlPaginaFredMercado(s.fred),
      fuente_id: "fred",
    };
    if (s.papel === "respaldo") {
      // Cierre de la sesión de Nueva York de ese día (16:00, o el cierre temprano).
      const sesion = sesionDe("us_acciones", d.fecha);
      if (sesion) fila.hora_dato = sesion.fin.toISOString();
      else fila.hora_dato = new Date(`${d.fecha}T21:00:00Z`).toISOString();
    }
    return fila;
  });
}

export const tareaCierresFred: Tarea = {
  nombre: "cierres-fred",
  fuenteId: "fred",
  async ejecutar(ctx) {
    const conFmp = !!ctx.entorno("FMP_API_KEY");
    const desde = sumarDias(ctx.ahora.toISOString().slice(0, 10), -DIAS);
    const advertencias: string[] = [];
    const filas: FilaObservacion[] = [];
    const leidas: string[] = [];
    for (const s of SERIES_FRED_MERCADO) {
      if (s.papel === "respaldo" && conFmp) continue;
      try {
        const r = await ctx.obtener(urlFredMercado(s.fred, desde));
        const datos = parsearCsvFredMercado(r.texto, s.fred);
        if (datos.length === 0) throw new Error(`sin observaciones desde ${desde}`);
        filas.push(...filasFredMercado(s, datos));
        leidas.push(`${s.serie}:${datos.at(-1)!.fecha}`);
      } catch (e) {
        advertencias.push(`${s.serie} (${s.fred}): ${(e as Error).message}`);
      }
    }
    if (filas.length === 0) throw new Error(advertencias.join(" · ") || "FRED no entregó datos");
    await ctx.registrar(filas);
    return { parcial: advertencias.length > 0, advertencias, detalle: { ultimas: leidas, respaldo_fmp: !conFmp } };
  },
};
