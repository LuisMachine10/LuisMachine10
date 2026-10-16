// Precios de cierre de la cartera de Mena Capital · Finnhub /api/v1/quote.
// Documentación: https://finnhub.io/docs/api/quote → {c, d, dp, h, l, o, pc, t}
//   c = precio actual (último), pc = cierre anterior, d = cambio, dp = cambio %, t = hora Unix del dato.
// Muestra: pruebas/muestras/finnhub-cartera/ (SINTÉTICA hasta que la sonda traiga la real; ver
// sondas/lotes/27-finnhub-cartera.txt). Un símbolo que Finnhub no conoce responde todo en 0 y t = 0.
//
// Los símbolos salen de mercado.simbolos_cartera() (lee personal.activos con SECURITY DEFINER): la
// ingesta nunca lee las cifras personales de Mena, solo la lista de símbolos.

import { ocultarClaves } from "../http.ts";
import type { Tarea } from "../ingesta.ts";
import { aDecimal, jsonExacto } from "../json.ts";

const BASE = "https://finnhub.io/api/v1/quote";
const RE_SIMBOLO = /^[A-Z0-9][A-Z0-9.\-]{0,14}$/;
/** Plan gratuito: 60 llamadas por minuto. Una cartera personal queda muy por debajo; esto es el tope duro. */
export const MAXIMO_SIMBOLOS = 50;

export function urlCotizacion(simbolo: string, clave: string): string {
  return `${BASE}?symbol=${encodeURIComponent(simbolo)}&token=${encodeURIComponent(clave)}`;
}

/** Enlace que se guarda y se muestra junto al precio: sin la clave. */
export function urlPublicaCotizacion(simbolo: string): string {
  return `${BASE}?symbol=${encodeURIComponent(simbolo)}`;
}

export interface FilaCotizacionCartera {
  simbolo: string;
  fecha: string;
  precio: string;
  cierre_anterior: string | null;
  cambio: string | null;
  cambio_pct: string | null;
  hora_dato: string;
  fuente: "finnhub";
  url_dato: string;
  recogido_en: string;
}

/** Día de Nueva York de un instante (el mercado de la cotización). */
export function fechaNuevaYork(instante: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(instante);
}

/**
 * Lee la respuesta de /quote. Devuelve la fila, o null con el motivo si no hay precio utilizable
 * (símbolo desconocido, precio 0, hora ausente). Nunca rellena: sin precio, no hay fila.
 */
export function parsearCotizacionFinnhub(
  texto: string,
  simbolo: string,
  recogidoEn: Date,
): { fila: FilaCotizacionCartera | null; motivo?: string } {
  let crudo: unknown;
  try {
    crudo = jsonExacto(texto);
  } catch {
    return { fila: null, motivo: `${simbolo}: la respuesta no es JSON` };
  }
  if (typeof crudo !== "object" || crudo === null || Array.isArray(crudo)) {
    return { fila: null, motivo: `${simbolo}: formato inesperado` };
  }
  const q = crudo as Record<string, unknown>;
  if (typeof q.error === "string") return { fila: null, motivo: `${simbolo}: Finnhub respondió «${q.error.slice(0, 120)}»` };

  const precio = aDecimal(q.c);
  const t = aDecimal(q.t);
  if (precio === null || t === null) return { fila: null, motivo: `${simbolo}: sin precio (c) o sin hora (t)` };
  if (!/^\d+$/.test(t) || t === "0" || !/^[0-9.]+$/.test(precio) || /^0+(\.0+)?$/.test(precio)) {
    return { fila: null, motivo: `${simbolo}: Finnhub no tiene cotización (precio ${precio}, t ${t}); se usa el precio manual` };
  }
  const instante = new Date(Number(t) * 1000); // segundos Unix enteros: exacto en float
  if (Number.isNaN(instante.getTime())) return { fila: null, motivo: `${simbolo}: hora inválida` };
  const pc = aDecimal(q.pc);
  return {
    fila: {
      simbolo,
      fecha: fechaNuevaYork(instante),
      precio,
      cierre_anterior: pc !== null && !/^-?0+(\.0+)?$/.test(pc) ? pc : null,
      cambio: aDecimal(q.d),
      cambio_pct: aDecimal(q.dp),
      hora_dato: instante.toISOString(),
      fuente: "finnhub",
      url_dato: urlPublicaCotizacion(simbolo),
      recogido_en: recogidoEn.toISOString(),
    },
  };
}

export const tareaPreciosCartera: Tarea = {
  nombre: "precios-cartera",
  fuenteId: "finnhub",
  async ejecutar(ctx) {
    const clave = ctx.entorno("FINNHUB_API_KEY")?.trim();
    if (!clave) return { parcial: true, advertencias: ["Falta FINNHUB_API_KEY"], detalle: { simbolos: 0 } };

    const lista = (await ctx.rpc<string[] | null>("simbolos_cartera")) ?? [];
    const advertencias: string[] = [];
    const simbolos = [...new Set(lista.map((s) => String(s).trim().toUpperCase()))].filter((s) => {
      if (RE_SIMBOLO.test(s)) return true;
      advertencias.push(`Símbolo inválido ignorado: «${s.slice(0, 20)}»`);
      return false;
    });
    if (simbolos.length === 0) {
      return { parcial: advertencias.length > 0, advertencias, detalle: { simbolos: 0, nota: "La cartera no tiene símbolos de acciones o ETF" } };
    }
    if (simbolos.length > MAXIMO_SIMBOLOS) {
      advertencias.push(`La cartera tiene ${simbolos.length} símbolos; se leen los primeros ${MAXIMO_SIMBOLOS}`);
      simbolos.length = MAXIMO_SIMBOLOS;
    }

    const filas: FilaCotizacionCartera[] = [];
    let fallidas = 0;
    for (const s of simbolos) {
      try {
        const r = await ctx.api(urlCotizacion(s, clave));
        const { fila, motivo } = parsearCotizacionFinnhub(r.texto, s, ctx.ahora);
        if (fila) filas.push(fila);
        else {
          fallidas++;
          advertencias.push(motivo!);
        }
      } catch (e) {
        fallidas++;
        advertencias.push(`${s}: ${ocultarClaves((e as Error).message)}`);
      }
    }

    if (filas.length === 0) throw new Error(advertencias.join(" · ") || "Ningún precio leído");
    await ctx.guardar("cotizaciones_cartera", filas as unknown as Record<string, unknown>[], { conflicto: "simbolo,fecha" });
    return {
      parcial: fallidas > 0 || advertencias.length > 0,
      advertencias,
      detalle: { simbolos: simbolos.length, leidos: filas.length, fallidos: fallidas, fechas: [...new Set(filas.map((f) => f.fecha))].sort() },
    };
  },
};
