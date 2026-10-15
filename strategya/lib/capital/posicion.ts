// Posición: valor de cada activo en RD$, tipo de cambio vigente y precio vigente de cada símbolo.
// Funciones puras: todo lo que necesitan llega en el Contexto (sin red ni base de datos).

import { Big, CERO, n, suma } from "./decimal";
import type { Activo, Cierres, Clase, Dec, Moneda, MonedaExtranjera, Parametros, Transaccion } from "./tipos";
import { CLASES } from "./tipos";

export type OrigenFx = "bcrd" | "manual" | "ninguno";

export interface FxMoneda {
  /** RD$ por unidad, o null si no hay ni serie ni tipo manual. */
  valor: Big | null;
  origen: OrigenFx;
  fecha: string | null;
  url: string | null;
  recogidoEn: string | null;
}

export type FxVigente = Record<MonedaExtranjera, FxMoneda>;

/** Observación de mercado.observaciones tal como llega de la base (cifras en texto). */
export interface ObservacionFx {
  valor: Dec;
  fecha_dato: string;
  recogido_en: string | null;
  url_dato: string | null;
}

export interface PrecioMercado {
  simbolo: string;
  precio: Dec;
  fecha: string;
  /** Cierre anterior según la fuente (Finnhub «pc») o el precio guardado del día previo. */
  anterior: Dec | null;
  horaDato: string | null;
  recogidoEn: string | null;
  url: string | null;
  fuente: string;
}

export interface Referencia {
  serie: string;
  nombre: string;
  /** Fracción (4.5 % = 0.045). */
  valor: Big;
  fecha: string;
  url: string | null;
}

export interface Mercado {
  fx: FxVigente;
  /** USDDOP_VENTA del día anterior al vigente (para el impacto del día). */
  fxAnteriorUSD: { valor: Big; fecha: string } | null;
  precios: Record<string, PrecioMercado>;
  referencias: Referencia[];
}

export interface Contexto {
  p: Parametros;
  activos: Activo[];
  tx: Transaccion[];
  cierres: Cierres;
  mercado: Mercado;
  /** Hoy en RD (AAAA-MM-DD). */
  hoy: string;
}

export const URL_BCRD_DOLAR = "https://www.bancentral.gov.do/";

/**
 * Tipo de cambio vigente. US$: el último USDDOP_VENTA del BCRD si existe; si no, el manual de los
 * parámetros. €: no hay serie EUR/DOP en el catálogo, así que siempre es el manual (o ninguno).
 */
export function armarFx(usdVenta: ObservacionFx[], p: Parametros): { fx: FxVigente; anteriorUSD: Mercado["fxAnteriorUSD"] } {
  const ordenadas = [...usdVenta].sort((a, b) => (a.fecha_dato < b.fecha_dato ? 1 : -1));
  const ultima = ordenadas.find((o) => new Big(o.valor).gt(0));
  const manual = (m: MonedaExtranjera): FxMoneda => {
    const v = p.fx[m];
    return v !== null && new Big(v).gt(0)
      ? { valor: new Big(v), origen: "manual", fecha: p.fxUpdated, url: null, recogidoEn: null }
      : { valor: null, origen: "ninguno", fecha: null, url: null, recogidoEn: null };
  };
  const usd: FxMoneda = ultima
    ? {
        valor: new Big(ultima.valor),
        origen: "bcrd",
        fecha: ultima.fecha_dato,
        url: ultima.url_dato ?? URL_BCRD_DOLAR,
        recogidoEn: ultima.recogido_en,
      }
    : manual("USD");
  const previa = ultima ? ordenadas.find((o) => o.fecha_dato < ultima.fecha_dato && new Big(o.valor).gt(0)) : undefined;
  return {
    fx: { USD: usd, EUR: manual("EUR") },
    anteriorUSD: previa ? { valor: new Big(previa.valor), fecha: previa.fecha_dato } : null,
  };
}

export function fxDe(ctx: Contexto, moneda: Moneda): Big | null {
  return moneda === "DOP" ? new Big(1) : ctx.mercado.fx[moneda].valor;
}

export function normalizarSimbolo(s: string | null | undefined): string | null {
  const t = (s ?? "").trim().toUpperCase();
  return t ? t : null;
}

export interface PrecioVigente {
  precio: Big;
  origen: "mercado" | "manual";
  mercado: PrecioMercado | null;
}

/**
 * Precio vigente: el de mercado si el activo tiene símbolo y hay cotización positiva; si no, el manual.
 * Un precio manual vacío vale 1 (saldos), como en el artefacto. Un 0 explícito se respeta (no se
 * convierte en 1: eso inventaría valor).
 */
export function precioDe(ctx: Contexto, a: Activo): PrecioVigente {
  const s = normalizarSimbolo(a.simbolo);
  const m = s ? ctx.mercado.precios[s] : undefined;
  if (m && new Big(m.precio).gt(0)) return { precio: new Big(m.precio), origen: "mercado", mercado: m };
  return { precio: a.precio === "" ? new Big(1) : n(a.precio), origen: "manual", mercado: null };
}

export function valorMoneda(ctx: Contexto, a: Activo): Big {
  return n(a.cantidad).times(precioDe(ctx, a).precio);
}

/** Valor en RD$, o null si falta el tipo de cambio de su moneda. */
export function valorDOP(ctx: Contexto, a: Activo): Big | null {
  const fx = fxDe(ctx, a.moneda);
  return fx === null ? null : valorMoneda(ctx, a).times(fx);
}

export function rentaAnual(ctx: Contexto, a: Activo): Big {
  return (valorDOP(ctx, a) ?? CERO).times(n(a.tasa));
}

export interface Posicion {
  porClase: Record<Clase, Big>;
  porMoneda: Partial<Record<Moneda, Big>>;
  porEmisor: Record<string, Big>;
  total: Big;
  rentaTotal: Big;
  liquidos: Big;
  extranjero: Big;
  /** Activos que no se pudieron valorar en RD$ (falta el tipo de cambio de su moneda). */
  sinValorar: Activo[];
}

export function posicion(ctx: Contexto): Posicion {
  const porClase = Object.fromEntries(CLASES.map((c) => [c.id, CERO])) as Record<Clase, Big>;
  const porMoneda: Partial<Record<Moneda, Big>> = {};
  const porEmisor: Record<string, Big> = {};
  const sinValorar: Activo[] = [];
  let total = CERO;
  let rentaTotal = CERO;
  for (const a of ctx.activos) {
    const v = valorDOP(ctx, a);
    if (v === null) {
      sinValorar.push(a);
      continue;
    }
    porClase[a.clase] = (porClase[a.clase] ?? CERO).plus(v);
    porMoneda[a.moneda] = (porMoneda[a.moneda] ?? CERO).plus(v);
    const emisor = a.inst.trim() || "Sin institución";
    porEmisor[emisor] = (porEmisor[emisor] ?? CERO).plus(v);
    total = total.plus(v);
    rentaTotal = rentaTotal.plus(v.times(n(a.tasa)));
  }
  const liquidos = porClase.efectivo.plus(porClase.ahorros);
  const extranjero = total.minus(porMoneda.DOP ?? CERO);
  return { porClase, porMoneda, porEmisor, total, rentaTotal, liquidos, extranjero, sinValorar };
}

export function totalActivos(ctx: Contexto, filtro: (a: Activo) => boolean): Big {
  return suma(ctx.activos.filter(filtro).map((a) => valorDOP(ctx, a) ?? CERO));
}
