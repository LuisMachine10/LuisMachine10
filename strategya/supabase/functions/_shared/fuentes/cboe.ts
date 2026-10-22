// Cboe · cotizaciones diferidas 15 min (JSON público del CDN que usa la propia web de Cboe; el proveedor
// «cboe» de OpenBB, Apache-2.0, lee las mismas direcciones).
//   Índices:  https://cdn.cboe.com/api/global/delayed_quotes/quotes/all_us_indices.json  (una sola llamada)
//   ETF:      https://cdn.cboe.com/api/global/delayed_quotes/quotes/SPY.json            (una por símbolo)
//   → { timestamp, data: { symbol, current_price, price_change, price_change_percent, prev_day_close,
//        last_trade_time: "2026-10-16T16:02:40" (hora de Nueva York, sin zona) … } }
// robots.txt: el CDN responde «AccessDenied» de S3 (no hay archivo) → se trata como sin robots.txt.
//
// Es respaldo: escribe en las series de FMP o de Finnhub solo si falta esa clave, y siempre en las suyas
// (Nasdaq 100 y VIX). Cada fila lleva fuente_id «cboe», así el sello dice de dónde salió la cifra.

import { ErrorIngesta } from "../http.ts";
import type { FilaObservacion, Tarea } from "../ingesta.ts";
import { aDecimal, jsonExacto } from "../json.ts";
import { estadoMercado, instanteLocal } from "../mercados.ts";
import { estadoProveedor, guardarIntentos, type Intento } from "../cotizaciones.ts";

export const BASE_CBOE = "https://cdn.cboe.com/api/global/delayed_quotes/quotes";
export const URL_INDICES_CBOE = `${BASE_CBOE}/all_us_indices.json`;
/** Página pública que se enlaza en el sello. */
export const URL_PAGINA_CBOE = "https://www.cboe.com/us/indices/";

type Dueno = "cboe" | "fmp" | "finnhub";

interface SimboloCboe {
  simbolo: string;
  serie: string;
  /** Fuente principal de la serie: si su clave existe, Cboe no escribe en ella. */
  dueno: Dueno;
}

export const INDICES_CBOE: readonly SimboloCboe[] = [
  { simbolo: "^SPX", serie: "IDX_SPX", dueno: "fmp" },
  { simbolo: "^RUT", serie: "IDX_RUT", dueno: "fmp" },
  { simbolo: "^NDX", serie: "IDX_NDX", dueno: "cboe" },
  { simbolo: "^VIX", serie: "IDX_VIX", dueno: "cboe" },
];

export const ETF_CBOE: readonly SimboloCboe[] = [
  { simbolo: "SPY", serie: "ETF_SPY", dueno: "finnhub" },
  { simbolo: "QQQ", serie: "ETF_QQQ", dueno: "finnhub" },
  { simbolo: "DIA", serie: "ETF_DIA", dueno: "finnhub" },
  { simbolo: "IWM", serie: "ETF_IWM", dueno: "finnhub" },
  { simbolo: "GLD", serie: "ETF_GLD", dueno: "finnhub" },
  { simbolo: "SLV", serie: "ETF_SLV", dueno: "finnhub" },
  { simbolo: "CPER", serie: "COBRE_CPER", dueno: "finnhub" },
  { simbolo: "USO", serie: "ETF_USO", dueno: "finnhub" },
  { simbolo: "BNO", serie: "ETF_BNO", dueno: "finnhub" },
  { simbolo: "UNG", serie: "ETF_UNG", dueno: "finnhub" },
  { simbolo: "UUP", serie: "ETF_UUP", dueno: "finnhub" },
  { simbolo: "IBIT", serie: "ETF_IBIT", dueno: "finnhub" },
];

const CLAVE_DE: Record<Exclude<Dueno, "cboe">, string> = { fmp: "FMP_API_KEY", finnhub: "FINNHUB_API_KEY" };

export function urlQuoteCboe(simbolo: string): string {
  return `${BASE_CBOE}/${encodeURIComponent(simbolo.replace(/^\^/, "_"))}.json`;
}

export interface CotizacionCboe {
  simbolo: string;
  precio: string;
  cambio: string | null;
  cambioPct: string | null;
  /** Máximo y mínimo del día y cierre anterior (las cotizaciones de acciones y ETF los traen; los índices, a veces). */
  maximo: string | null;
  minimo: string | null;
  cierreAnterior: string | null;
  /** Día de negociación (fecha de Nueva York del último precio). */
  dia: string;
  hora: Date;
}

const HORA_NY = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

/** «2026-10-16T16:02:40» (Nueva York, sin zona) → instante UTC. */
export function horaNuevaYork(texto: string): { dia: string; hora: Date } {
  const m = HORA_NY.exec(texto.trim());
  if (!m) throw new Error(`Cboe: hora inválida «${texto}»`);
  const base = instanteLocal(m[1], Number(m[2]) * 60 + Number(m[3]), "America/New_York");
  return { dia: m[1], hora: new Date(base.getTime() + Number(m[4]) * 1000) };
}

function cotizacionDe(d: Record<string, unknown>): CotizacionCboe | null {
  const simbolo = typeof d.symbol === "string" ? d.symbol : "";
  const precio = aDecimal(d.current_price);
  if (!simbolo || !precio || precio === "0" || typeof d.last_trade_time !== "string") return null;
  const { dia, hora } = horaNuevaYork(d.last_trade_time);
  const positivo = (v: unknown) => {
    const x = aDecimal(v);
    return x !== null && /^[0-9.]+$/.test(x) && !/^0+(\.0+)?$/.test(x) ? x : null;
  };
  return {
    simbolo,
    precio,
    cambio: aDecimal(d.price_change),
    cambioPct: aDecimal(d.price_change_percent),
    maximo: positivo(d.high),
    minimo: positivo(d.low),
    cierreAnterior: positivo(d.prev_day_close),
    dia,
    hora,
  };
}

/** all_us_indices.json → cotizaciones de los símbolos pedidos (los demás se ignoran). */
export function parsearIndicesCboe(texto: string, simbolos: readonly string[]): CotizacionCboe[] {
  const j = jsonExacto<{ data?: unknown }>(texto);
  if (!j || !Array.isArray(j.data)) throw new Error("Cboe: formato inesperado (falta data[])");
  const quiero = new Set(simbolos);
  return (j.data as Record<string, unknown>[])
    .filter((d) => d && typeof d === "object" && quiero.has(String(d.symbol)))
    .map(cotizacionDe)
    .filter((c): c is CotizacionCboe => c !== null);
}

/** quotes/SPY.json → cotización, o null si viene sin precio. */
export function parsearQuoteCboe(texto: string): CotizacionCboe | null {
  const j = jsonExacto<{ data?: unknown }>(texto);
  if (!j || !j.data || typeof j.data !== "object" || Array.isArray(j.data)) throw new Error("Cboe: formato inesperado (falta data)");
  return cotizacionDe(j.data as Record<string, unknown>);
}

export function filaCboe(c: CotizacionCboe, serieId: string): FilaObservacion {
  const fila: FilaObservacion = {
    serie_id: serieId,
    valor: c.precio,
    fecha_dato: c.dia,
    hora_dato: c.hora.toISOString(),
    url_dato: URL_PAGINA_CBOE,
    fuente_id: "cboe",
  };
  if (c.cambio !== null) fila.cambio = c.cambio;
  if (c.cambioPct !== null) fila.cambio_pct = c.cambioPct;
  return fila;
}

/** Minutos después del cierre en que todavía se lee (el dato llega 15 min diferido). */
const MIN_TRAS_CIERRE = 20;

/**
 * ¿Toca leer? Con el mercado abierto, sí. Cerrado: solo si la última lectura buena de las series propias
 * de Cboe es anterior al cierre de la última sesión + 20 min (captura el cierre y la primera lectura).
 */
export function tocaLeer(ahora: Date, ultimoOk: Date | null): { leer: boolean; motivo: string } {
  const e = estadoMercado("us_acciones", ahora);
  if (e.abierto) return { leer: true, motivo: "abierto" };
  if (!e.sesion) return { leer: !ultimoOk, motivo: "primera" };
  const listo = e.sesion.fin.getTime() + MIN_TRAS_CIERRE * 60_000;
  if (ahora.getTime() < listo) return { leer: true, motivo: "cierre" };
  if (!ultimoOk || ultimoOk.getTime() < listo) return { leer: true, motivo: ultimoOk ? "cierre" : "primera" };
  return { leer: false, motivo: "Mercado de EE. UU. cerrado; cierre ya leído" };
}

export const tareaCotizacionesCboe: Tarea = {
  nombre: "cotizaciones-cboe",
  fuenteId: "cboe",
  async ejecutar(ctx) {
    const estado = await estadoProveedor(ctx, "cboe", "cboe");
    const advertencias = [...estado.advertencias];
    const oks = estado.series.map((s) => s.ultimoOk);
    const ultimoOk = oks.length && oks.every((x) => x) ? new Date(Math.min(...oks.map((x) => x!.getTime()))) : null;
    const turno = tocaLeer(ctx.ahora, ultimoOk);
    if (!turno.leer) return { detalle: { omitida: turno.motivo } };

    const toca = (s: SimboloCboe) => s.dueno === "cboe" || !ctx.entorno(CLAVE_DE[s.dueno]);
    const indices = INDICES_CBOE.filter(toca);
    const etf = ETF_CBOE.filter(toca);

    const filas: FilaObservacion[] = [];
    const intentos: Intento[] = [];
    try {
      const r = await ctx.obtener(URL_INDICES_CBOE);
      const cot = new Map(parsearIndicesCboe(r.texto, indices.map((s) => s.simbolo)).map((c) => [c.simbolo, c]));
      for (const s of indices) {
        const c = cot.get(s.simbolo);
        if (c) filas.push(filaCboe(c, s.serie));
        else advertencias.push(`${s.serie} (${s.simbolo}): no vino en all_us_indices.json`);
        intentos.push(c ? { serie_id: s.serie, ok: true } : { serie_id: s.serie, ok: false, error: "no vino en la lista de índices" });
      }
    } catch (e) {
      advertencias.push(`Índices: ${(e as Error).message}`);
      for (const s of indices) intentos.push({ serie_id: s.serie, ok: false, error: (e as Error).message });
    }

    for (const s of etf) {
      try {
        const r = await ctx.obtener(urlQuoteCboe(s.simbolo));
        const c = parsearQuoteCboe(r.texto);
        if (!c) throw new Error("vino sin precio");
        filas.push(filaCboe(c, s.serie));
        intentos.push({ serie_id: s.serie, ok: true });
      } catch (e) {
        const m = e instanceof ErrorIngesta && e.status === 404 ? "Cboe no publica este símbolo (404)" : (e as Error).message;
        advertencias.push(`${s.serie} (${s.simbolo}): ${m}`);
        intentos.push({ serie_id: s.serie, ok: false, error: m });
      }
    }

    await ctx.registrar(filas);
    await guardarIntentos(ctx, "cboe", intentos);
    if (filas.length === 0) throw new Error(advertencias.join(" · ") || "Ninguna cotización llegó");
    return {
      parcial: advertencias.length > 0,
      advertencias,
      detalle: { motivo: turno.motivo, guardadas: filas.length, series: filas.map((f) => f.serie_id) },
    };
  },
};
