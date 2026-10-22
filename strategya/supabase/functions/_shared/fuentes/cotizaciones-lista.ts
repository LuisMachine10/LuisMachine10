// Cotizaciones de «Mi lista» y de «Mis posiciones» (acciones y ETF de EE. UU.) · Cboe, diferidas 15 min.
//   https://cdn.cboe.com/api/global/delayed_quotes/quotes/<SIMBOLO>.json  (una llamada por símbolo, 1 s de pausa)
//   Mismo lector que cotizaciones-cboe: robots.txt (el CDN no publica uno), sin cambiar el User-Agent.
//
// Los símbolos salen de mercado.simbolos_lista() (SECURITY DEFINER): la ingesta solo recibe la lista de
// símbolos de personal.watchlist y de los activos de Renta Variable, nunca cantidades ni montos.
// Se guardan en mercado.cotizaciones_cartera (la misma tabla de precios-cartera) con fuente «cboe».
// Un símbolo que Cboe no publica (404) se anota en mercado.simbolos_sin_cotizacion y no se vuelve a pedir
// en 24 h (la función lo excluye).

import { ErrorIngesta } from "../http.ts";
import type { Tarea } from "../ingesta.ts";
import { parsearQuoteCboe, tocaLeer, urlQuoteCboe, type CotizacionCboe } from "./cboe.ts";

/** Formato que acepta la tabla mercado.cotizaciones_cartera. */
const RE_SIMBOLO = /^[A-Z0-9][A-Z0-9.\-]{0,14}$/;
/** Tope duro por corrida: 50 llamadas a 1 por segundo caben de sobra en una corrida de 5 minutos. */
export const MAXIMO_SIMBOLOS_LISTA = 50;
export const MOTIVO_NO_PUBLICA = "Cboe no publica este símbolo";

export interface ListaSimbolos {
  simbolos: string[];
  /** Símbolos marcados como «no publicado» en las últimas 24 h (no se piden). */
  omitidos: string[];
  /** La lectura Cboe más vieja entre los símbolos pedidos; null si alguno nunca se leyó. */
  ultimo_ok: string | null;
}

export interface FilaCotizacionLista {
  simbolo: string;
  fecha: string;
  precio: string;
  cierre_anterior: string | null;
  cambio: string | null;
  cambio_pct: string | null;
  maximo: string | null;
  minimo: string | null;
  hora_dato: string;
  fuente: "cboe";
  url_dato: string;
  recogido_en: string;
}

/** Cotización de Cboe → fila de mercado.cotizaciones_cartera (texto exacto; nada se calcula). */
export function filaCotizacionLista(simbolo: string, c: CotizacionCboe, recogidoEn: Date): FilaCotizacionLista {
  return {
    simbolo,
    fecha: c.dia,
    precio: c.precio,
    cierre_anterior: c.cierreAnterior,
    cambio: c.cambio,
    cambio_pct: c.cambioPct,
    maximo: c.maximo,
    minimo: c.minimo,
    hora_dato: c.hora.toISOString(),
    fuente: "cboe",
    url_dato: urlQuoteCboe(simbolo),
    recogido_en: recogidoEn.toISOString(),
  };
}

/** Normaliza lo que devuelve la función de la base (tolera null y basura sin lanzar). */
export function leerLista(crudo: unknown): ListaSimbolos {
  const o = crudo && typeof crudo === "object" && !Array.isArray(crudo) ? (crudo as Record<string, unknown>) : {};
  const textos = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    simbolos: textos(o.simbolos),
    omitidos: textos(o.omitidos),
    ultimo_ok: typeof o.ultimo_ok === "string" ? o.ultimo_ok : null,
  };
}

export const tareaCotizacionesLista: Tarea = {
  nombre: "cotizaciones-lista",
  fuenteId: "cboe",
  async ejecutar(ctx) {
    const lista = leerLista(await ctx.rpc<unknown>("simbolos_lista"));
    const advertencias: string[] = [];
    const simbolos = [...new Set(lista.simbolos.map((s) => s.trim().toUpperCase()))].filter((s) => {
      if (RE_SIMBOLO.test(s)) return true;
      advertencias.push(`Símbolo inválido ignorado: «${s.slice(0, 20)}»`);
      return false;
    });
    if (simbolos.length === 0) {
      return {
        parcial: advertencias.length > 0,
        advertencias,
        detalle: { simbolos: 0, omitidos: lista.omitidos, nota: "Mi lista y las posiciones con símbolo están vacías" },
      };
    }

    const turno = tocaLeer(ctx.ahora, lista.ultimo_ok ? new Date(lista.ultimo_ok) : null);
    if (!turno.leer) return { detalle: { omitida: turno.motivo, simbolos: simbolos.length } };

    if (simbolos.length > MAXIMO_SIMBOLOS_LISTA) {
      advertencias.push(`Hay ${simbolos.length} símbolos; se leen los primeros ${MAXIMO_SIMBOLOS_LISTA}`);
      simbolos.length = MAXIMO_SIMBOLOS_LISTA;
    }

    const filas: FilaCotizacionLista[] = [];
    const noPublicados: string[] = [];
    let fallidos = 0;
    for (const s of simbolos) {
      try {
        const r = await ctx.obtener(urlQuoteCboe(s));
        const c = parsearQuoteCboe(r.texto);
        if (!c) throw new Error("vino sin precio");
        filas.push(filaCotizacionLista(s, c, ctx.ahora));
      } catch (e) {
        if (e instanceof ErrorIngesta && e.status === 404) {
          noPublicados.push(s);
          advertencias.push(`${s}: ${MOTIVO_NO_PUBLICA} (404); no se vuelve a pedir en 24 h`);
        } else {
          fallidos++;
          advertencias.push(`${s}: ${(e as Error).message}`);
        }
      }
    }

    if (noPublicados.length) {
      await ctx.guardar(
        "simbolos_sin_cotizacion",
        noPublicados.map((simbolo) => ({ simbolo, fuente: "cboe", motivo: MOTIVO_NO_PUBLICA, marcado_en: ctx.ahora.toISOString() })),
        { conflicto: "simbolo,fuente" },
      );
    }
    if (filas.length) {
      await ctx.guardar("cotizaciones_cartera", filas as unknown as Record<string, unknown>[], { conflicto: "simbolo,fecha" });
    }
    // Todo falló por red o formato (no por símbolos inexistentes): la corrida es un error visible en Estado.
    if (filas.length === 0 && fallidos > 0) throw new Error(advertencias.join(" · "));
    return {
      parcial: advertencias.length > 0,
      advertencias,
      detalle: {
        motivo: turno.motivo,
        simbolos: simbolos.length,
        leidos: filas.length,
        no_publicados: noPublicados,
        omitidos: lista.omitidos,
        fallidos,
      },
    };
  },
};
