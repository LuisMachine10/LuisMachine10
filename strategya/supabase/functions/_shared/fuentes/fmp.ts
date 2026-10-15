// Financial Modeling Prep · cotizaciones (quote-short, un símbolo por llamada) y movimientos del día
// (biggest-gainers / biggest-losers). API oficial con la clave de Mena: https://site.financialmodelingprep.com/developer/docs
//
// Plan de Mena verificado el 15 oct 2026 (conector FMP, misma API):
//   quote-short permite ^GSPC ^DJI ^IXIC ^RUT ^STOXX50E ^FTSE ^N225 ^HSI EURUSD USDJPY GCUSD SIUSD BZUSD BTCUSD
//   y niega ^GDAXI, CLUSD, NGUSD, DX-Y.NYB, HGUSD (cobre), CPER, batch-quote y quote completo.
//   biggest-gainers y biggest-losers: permitidos.
// quote-short no trae hora: hora_dato = momento de la consulta (la pantalla lo dice).

import { ErrorIngesta } from "../http.ts";
import type { ContextoTarea, FilaObservacion, Tarea } from "../ingesta.ts";
import { aDecimal, jsonExacto } from "../json.ts";
import { diaNegociacion, estadoMercado, type Mercado } from "../mercados.ts";
import { planificar } from "../planificador.ts";
import { cambioPorcentual, diaPresupuesto, estadoProveedor, guardarIntentos, type Intento } from "../cotizaciones.ts";

export const BASE_FMP = "https://financialmodelingprep.com/stable";
export const LLAMADAS_DIA_POR_DEFECTO = 240;
/** Llamadas que el planificador deja para movimientos-acciones mientras la sesión de EE. UU. no termina. */
export const RESERVA_MOVIMIENTOS = 14;

export function urlQuoteShort(simbolo: string, clave: string): string {
  return `${BASE_FMP}/quote-short?symbol=${encodeURIComponent(simbolo)}&apikey=${encodeURIComponent(clave)}`;
}

export function urlMovimientos(tipo: "sube" | "baja", clave: string): string {
  return `${BASE_FMP}/${tipo === "sube" ? "biggest-gainers" : "biggest-losers"}?apikey=${encodeURIComponent(clave)}`;
}

export interface CotizacionFmp {
  simbolo: string;
  precio: string;
  cambio: string | null;
  volumen: string | null;
}

/** Mensaje de error que FMP devuelve dentro de un 200 ({"Error Message": "..."}). */
function errorEnCuerpo(datos: unknown): string | null {
  if (datos && typeof datos === "object" && !Array.isArray(datos)) {
    const o = datos as Record<string, unknown>;
    const m = o["Error Message"] ?? o["error"] ?? o["message"];
    return typeof m === "string" ? m : "respuesta sin arreglo";
  }
  return null;
}

/** Respuesta de /stable/quote-short → cotizaciones con los números como el texto exacto de FMP. */
export function parsearQuoteShort(texto: string): CotizacionFmp[] {
  const datos = jsonExacto<unknown>(texto);
  const error = errorEnCuerpo(datos);
  if (error) throw new Error(`FMP: ${error}`);
  if (!Array.isArray(datos)) throw new Error("FMP: formato inesperado");
  const salida: CotizacionFmp[] = [];
  for (const d of datos as Record<string, unknown>[]) {
    const simbolo = typeof d?.symbol === "string" ? d.symbol : null;
    const precio = aDecimal(d?.price);
    if (!simbolo || !precio) continue;
    salida.push({ simbolo, precio, cambio: aDecimal(d.change), volumen: aDecimal(d.volume) });
  }
  return salida;
}

/** Cotización → observación. fecha_dato = día de negociación del mercado en el momento de la consulta. */
export function filaFmp(c: CotizacionFmp, serieId: string, mercado: Mercado, consultadoEn: Date): FilaObservacion {
  const fila: FilaObservacion = {
    serie_id: serieId,
    valor: c.precio,
    fecha_dato: diaNegociacion(mercado, consultadoEn),
    hora_dato: consultadoEn.toISOString(),
  };
  if (c.cambio !== null) {
    fila.cambio = c.cambio;
    const pct = cambioPorcentual(c.precio, c.cambio);
    if (pct !== null) fila.cambio_pct = pct;
  }
  return fila;
}

export function limiteLlamadas(valor: string | undefined): { limite: number; advertencia?: string } {
  if (valor === undefined || valor.trim() === "") return { limite: LLAMADAS_DIA_POR_DEFECTO };
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 0) {
    return { limite: LLAMADAS_DIA_POR_DEFECTO, advertencia: `FMP_LLAMADAS_DIA inválido («${valor}»): se usa ${LLAMADAS_DIA_POR_DEFECTO}` };
  }
  return { limite: n };
}

/** ¿Falta aún la sesión de EE. UU. de hoy (o su captura de cierre)? Entonces se reserva para movimientos. */
function reservaMovimientos(ahora: Date): number {
  const e = estadoMercado("us_acciones", ahora);
  if (e.abierto) return RESERVA_MOVIMIENTOS;
  const hoy = diaPresupuesto(ahora);
  return e.proximaApertura && diaPresupuesto(e.proximaApertura) === hoy ? RESERVA_MOVIMIENTOS : 0;
}

async function reservar(ctx: ContextoTarea, cantidad: number, limite: number): Promise<number> {
  const r = await ctx.rpc<number | string | null>("reservar_llamadas", {
    p_proveedor: "fmp",
    p_dia: diaPresupuesto(ctx.ahora),
    p_cantidad: cantidad,
    p_limite: limite,
  });
  return Number(r ?? 0);
}

const esDenegacion = (e: unknown) => e instanceof ErrorIngesta && (e.status === 402 || e.status === 403);
const esClaveInvalida = (e: unknown) => e instanceof ErrorIngesta && e.status === 401;

export const tareaCotizacionesFmp: Tarea = {
  nombre: "cotizaciones-fmp",
  fuenteId: "fmp",
  async ejecutar(ctx) {
    const clave = ctx.entorno("FMP_API_KEY");
    if (!clave) return { parcial: true, advertencias: ["Falta FMP_API_KEY"] };
    const { limite, advertencia } = limiteLlamadas(ctx.entorno("FMP_LLAMADAS_DIA"));
    const advertencias: string[] = advertencia ? [advertencia] : [];

    const estado = await estadoProveedor(ctx, "fmp", "fmp");
    advertencias.push(...estado.advertencias);
    const plan = planificar({
      series: estado.series,
      ahora: ctx.ahora,
      limiteDia: limite,
      usadasHoy: estado.llamadasHoy,
      reserva: reservaMovimientos(ctx.ahora),
    });
    const resumenPlan = { modo: plan.modo, restantes: plan.restantes, usadas_hoy: estado.llamadasHoy, limite };
    if (plan.elegidas.length === 0) return { advertencias, parcial: advertencias.length > 0, detalle: { plan: resumenPlan, pedidas: [] } };

    const otorgadas = await reservar(ctx, plan.elegidas.length, limite);
    const aPedir = plan.elegidas.slice(0, otorgadas);
    if (aPedir.length < plan.elegidas.length) advertencias.push(`Presupuesto: se otorgaron ${otorgadas} de ${plan.elegidas.length} llamadas`);

    const porId = new Map(estado.series.map((s) => [s.id, s]));
    const filas: FilaObservacion[] = [];
    const intentos: Intento[] = [];
    for (const e of aPedir) {
      const serie = porId.get(e.id)!;
      const consultadoEn = ctx.ahora;
      try {
        const r = await ctx.api(urlQuoteShort(e.simbolo, clave));
        const c = parsearQuoteShort(r.texto).find((x) => x.simbolo === e.simbolo);
        if (!c) throw new Error(`FMP no devolvió precio para ${e.simbolo}`);
        filas.push(filaFmp(c, e.id, serie.mercado, consultadoEn));
        intentos.push({ serie_id: e.id, ok: true });
      } catch (err) {
        if (esClaveInvalida(err)) {
          await guardarIntentos(ctx, "fmp", intentos);
          await ctx.registrar(filas);
          throw new Error("FMP rechazó la clave (HTTP 401): revisar FMP_API_KEY");
        }
        const mensaje = (err as Error).message;
        intentos.push({ serie_id: e.id, ok: false, error: mensaje, denegado: esDenegacion(err) });
        advertencias.push(`${e.id} (${e.simbolo}): ${esDenegacion(err) ? "el plan no lo permite; no se pide por 24 h" : mensaje}`);
      }
    }
    await ctx.registrar(filas);
    await guardarIntentos(ctx, "fmp", intentos);
    if (filas.length === 0 && aPedir.length > 0) throw new Error(advertencias.join(" · ") || "Ninguna cotización llegó");
    return {
      parcial: advertencias.length > 0,
      advertencias,
      detalle: { plan: resumenPlan, pedidas: aPedir.map((e) => `${e.id}:${e.motivo}`), guardadas: filas.length },
    };
  },
};

// ───────────────────────── movimientos del día (acciones) ─────────────────────────

export interface MovimientoAccion {
  posicion: number;
  simbolo: string;
  nombre: string | null;
  precio: string;
  cambio: string | null;
  cambio_pct: string | null;
  bolsa: string | null;
}

export const MAX_MOVIMIENTOS = 10;

export function parsearMovimientos(texto: string, max = MAX_MOVIMIENTOS): MovimientoAccion[] {
  const datos = jsonExacto<unknown>(texto);
  const error = errorEnCuerpo(datos);
  if (error) throw new Error(`FMP: ${error}`);
  if (!Array.isArray(datos)) throw new Error("FMP: formato inesperado");
  const salida: MovimientoAccion[] = [];
  for (const d of datos as Record<string, unknown>[]) {
    const simbolo = typeof d?.symbol === "string" ? d.symbol : null;
    const precio = aDecimal(d?.price);
    if (!simbolo || !precio) continue;
    salida.push({
      posicion: salida.length + 1,
      simbolo,
      nombre: typeof d.name === "string" ? d.name : null,
      precio,
      cambio: aDecimal(d.change),
      cambio_pct: aDecimal(d.changesPercentage),
      bolsa: typeof d.exchange === "string" ? d.exchange : null,
    });
    if (salida.length >= max) break;
  }
  return salida;
}

/** Ventana tras el cierre de EE. UU. en la que todavía se leen los movimientos del día. */
const VENTANA_CIERRE_MOVIMIENTOS_MIN = 30;

export const tareaMovimientosAcciones: Tarea = {
  nombre: "movimientos-acciones",
  fuenteId: "fmp",
  async ejecutar(ctx) {
    const clave = ctx.entorno("FMP_API_KEY");
    if (!clave) return { parcial: true, advertencias: ["Falta FMP_API_KEY"] };
    const e = estadoMercado("us_acciones", ctx.ahora);
    const trasCierre = e.sesion ? (ctx.ahora.getTime() - e.sesion.fin.getTime()) / 60_000 : Infinity;
    if (!e.abierto && trasCierre > VENTANA_CIERRE_MOVIMIENTOS_MIN) {
      return { detalle: { omitida: "Mercado de EE. UU. cerrado: no se gastan llamadas" } };
    }
    const { limite, advertencia } = limiteLlamadas(ctx.entorno("FMP_LLAMADAS_DIA"));
    const advertencias: string[] = advertencia ? [advertencia] : [];
    const otorgadas = await reservar(ctx, 2, limite);
    if (otorgadas < 2) {
      return { parcial: true, advertencias: [...advertencias, `Sin presupuesto de FMP para hoy (${otorgadas} de 2 llamadas)`] };
    }
    const fecha = diaNegociacion("us_acciones", ctx.ahora);
    let leidos = 0;
    for (const tipo of ["sube", "baja"] as const) {
      try {
        const r = await ctx.api(urlMovimientos(tipo, clave));
        const lista = parsearMovimientos(r.texto);
        await ctx.rpc("reemplazar_movimientos", {
          p_fecha: fecha,
          p_tipo: tipo,
          p_recogido_en: ctx.ahora.toISOString(),
          p_filas: lista,
        });
        leidos += lista.length;
      } catch (err) {
        if (esClaveInvalida(err)) throw new Error("FMP rechazó la clave (HTTP 401): revisar FMP_API_KEY");
        advertencias.push(`${tipo === "sube" ? "Ganadores" : "Perdedores"}: ${(err as Error).message}`);
      }
    }
    if (leidos === 0) throw new Error(advertencias.join(" · ") || "FMP no devolvió movimientos");
    return { parcial: advertencias.length > 0, advertencias, detalle: { fecha, leidos } };
  },
};
