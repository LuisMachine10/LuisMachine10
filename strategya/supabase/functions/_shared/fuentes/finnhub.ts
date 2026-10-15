// Finnhub · cotización de ETF de EE. UU. (plan gratuito, 60 llamadas por minuto, uso personal).
// Documentación: https://finnhub.io/docs/api/quote
//   GET https://finnhub.io/api/v1/quote?symbol=SPY   (clave en el encabezado X-Finnhub-Token)
//   → { c: precio, d: cambio, dp: cambio %, h, l, o, pc: cierre previo, t: unix (s) }
// Se consulta cada 5 min en horario regular de EE. UU. (9:30–16:00 Nueva York) y una vez tras el cierre.

import { ErrorIngesta } from "../http.ts";
import type { FilaObservacion, Tarea } from "../ingesta.ts";
import { aDecimal, jsonExacto } from "../json.ts";
import { diaNegociacion } from "../mercados.ts";
import { planificar } from "../planificador.ts";
import { estadoProveedor, guardarIntentos, type Intento } from "../cotizaciones.ts";

export const BASE_FINNHUB = "https://finnhub.io/api/v1";

export function urlQuoteFinnhub(simbolo: string): string {
  return `${BASE_FINNHUB}/quote?symbol=${encodeURIComponent(simbolo)}`;
}

export interface CotizacionFinnhub {
  precio: string;
  cambio: string | null;
  cambioPct: string | null;
  cierrePrevio: string | null;
  /** Momento del dato según Finnhub. */
  hora: Date;
}

/** Respuesta de /quote → cotización exacta. null si Finnhub no tiene datos del símbolo (c = 0 y t = 0). */
export function parsearQuoteFinnhub(texto: string): CotizacionFinnhub | null {
  const d = jsonExacto<Record<string, unknown>>(texto);
  if (!d || typeof d !== "object" || Array.isArray(d)) throw new Error("Finnhub: formato inesperado");
  if (typeof d.error === "string") throw new Error(`Finnhub: ${d.error}`);
  const precio = aDecimal(d.c);
  const t = aDecimal(d.t);
  if (!precio || !t || precio === "0" || t === "0") return null;
  // Number() solo para el instante (segundos unix), nunca para el precio.
  const hora = new Date(Number(t) * 1000);
  if (Number.isNaN(hora.getTime())) throw new Error(`Finnhub: hora inválida «${t}»`);
  return { precio, cambio: aDecimal(d.d), cambioPct: aDecimal(d.dp), cierrePrevio: aDecimal(d.pc), hora };
}

export function filaFinnhub(c: CotizacionFinnhub, serieId: string): FilaObservacion {
  const fila: FilaObservacion = {
    serie_id: serieId,
    valor: c.precio,
    fecha_dato: diaNegociacion("us_acciones", c.hora),
    hora_dato: c.hora.toISOString(),
  };
  if (c.cambio !== null) fila.cambio = c.cambio;
  if (c.cambioPct !== null) fila.cambio_pct = c.cambioPct;
  return fila;
}

export const tareaCotizacionesFinnhub: Tarea = {
  nombre: "cotizaciones-finnhub",
  fuenteId: "finnhub",
  async ejecutar(ctx) {
    const clave = ctx.entorno("FINNHUB_API_KEY");
    if (!clave) return { parcial: true, advertencias: ["Falta FINNHUB_API_KEY"] };

    const estado = await estadoProveedor(ctx, "finnhub", "finnhub");
    const advertencias = [...estado.advertencias];
    const plan = planificar({ series: estado.series, ahora: ctx.ahora, limiteDia: null, usadasHoy: 0, prioridad: ["COBRE_CPER"] });
    if (plan.elegidas.length === 0) {
      return { parcial: advertencias.length > 0, advertencias, detalle: { omitida: "Mercado de EE. UU. cerrado", pedidas: [] } };
    }

    const filas: FilaObservacion[] = [];
    const intentos: Intento[] = [];
    for (const e of plan.elegidas) {
      try {
        const r = await ctx.api(urlQuoteFinnhub(e.simbolo), { encabezados: { "X-Finnhub-Token": clave } });
        const c = parsearQuoteFinnhub(r.texto);
        if (!c) throw new Error(`Finnhub no tiene datos de ${e.simbolo}`);
        filas.push(filaFinnhub(c, e.id));
        intentos.push({ serie_id: e.id, ok: true });
      } catch (err) {
        if (err instanceof ErrorIngesta && err.status === 401) {
          await ctx.registrar(filas);
          await guardarIntentos(ctx, "finnhub", intentos);
          throw new Error("Finnhub rechazó la clave (HTTP 401): revisar FINNHUB_API_KEY");
        }
        const denegado = err instanceof ErrorIngesta && err.status === 403;
        intentos.push({ serie_id: e.id, ok: false, error: (err as Error).message, denegado });
        advertencias.push(`${e.id} (${e.simbolo}): ${denegado ? "el plan no lo permite; no se pide por 24 h" : (err as Error).message}`);
      }
    }
    await ctx.registrar(filas);
    await guardarIntentos(ctx, "finnhub", intentos);
    if (filas.length === 0) throw new Error(advertencias.join(" · ") || "Ninguna cotización llegó");
    return {
      parcial: advertencias.length > 0,
      advertencias,
      detalle: { pedidas: plan.elegidas.map((e) => `${e.id}:${e.motivo}`), guardadas: filas.length },
    };
  },
};
