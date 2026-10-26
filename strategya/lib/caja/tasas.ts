// Tipo de cambio del Presupuesto: cómo se pasa a RD$ un monto en US$. Puro, con big.js.
//
// Regla (la misma de personal.tasa_usd_bcrd en la migración 20261027000100_deudas_y_dolares.sql):
//   1. La tasa propia del movimiento, si Mena la anotó (la que le aplicó su banco).
//   2. Si no, el dólar de venta oficial del BCRD de la fecha del movimiento: el último publicado hasta esa
//      fecha (las fechas futuras usan el de hoy), con un máximo de 7 días de antigüedad (el BCRD no publica
//      fines de semana ni feriados).
//   3. Si no hay ninguna: null. El monto no se suma y la pantalla dice «no confirmado». No se inventa.
// La tasa general de Configuración ya no se usa para convertir (era una cifra fija escrita a mano).

import Big from "big.js";
import { type Fecha, sumarDias } from "./fechas";
import type { Moneda } from "./tipos";

/** Una observación diaria del dólar de venta del BCRD (mercado.observaciones · USDDOP_VENTA). */
export interface TasaDia {
  fecha: Fecha;
  valor: string;
  url: string | null;
}

/** Serie del dólar BCRD que acompaña a los datos del Presupuesto. */
export interface TasasUSD {
  /** Hoy en RD: una fecha futura usa la tasa de hoy. */
  hoy: Fecha;
  /** Ordenada por fecha ascendente. */
  serie: TasaDia[];
}

export interface TasaUsada {
  valor: string;
  origen: "propia" | "bcrd";
  /** Fecha del dato del BCRD (null en una tasa propia). */
  fecha: Fecha | null;
  url: string | null;
}

export const FUENTE_BCRD = { nombre: "Banco Central (BCRD) · dólar de venta", url: "https://www.bancentral.gov.do/a/d/2532-mercado-cambiario" };

/** Antigüedad máxima del dato del BCRD frente a la fecha pedida. */
export const DIAS_MAXIMOS_TASA = 7;

/** Dólar BCRD vigente en `fecha` (o null). */
export function tasaBcrd(tasas: TasasUSD | null | undefined, fecha: Fecha): TasaUsada | null {
  if (!tasas?.serie.length) return null;
  const ref = fecha > tasas.hoy ? tasas.hoy : fecha;
  const minimo = sumarDias(ref, -DIAS_MAXIMOS_TASA);
  for (let i = tasas.serie.length - 1; i >= 0; i--) {
    const t = tasas.serie[i];
    if (t.fecha > ref) continue;
    if (t.fecha < minimo) return null;
    if (new Big(t.valor).lte(0)) continue;
    return { valor: t.valor, origen: "bcrd", fecha: t.fecha, url: t.url };
  }
  return null;
}

/** Qué tasa se usa para un monto en `moneda` en `fecha`. DOP no necesita tasa (devuelve null). */
export function tasaPara(moneda: Moneda, tasaPropia: string | null | undefined, tasas: TasasUSD | null | undefined, fecha: Fecha): TasaUsada | null {
  if (moneda !== "USD") return null;
  if (tasaPropia && !new Big(tasaPropia).eq(0)) return { valor: tasaPropia, origen: "propia", fecha: null, url: null };
  return tasaBcrd(tasas, fecha);
}

/** Monto en RD$. US$ sin tasa → null (no se inventa). */
export function aDOP(monto: string, moneda: Moneda, tasaPropia: string | null | undefined, tasas: TasasUSD | null | undefined, fecha: Fecha): Big | null {
  const m = new Big(monto);
  if (moneda !== "USD") return m;
  const t = tasaPara(moneda, tasaPropia, tasas, fecha);
  return t ? m.times(t.valor) : null;
}

/**
 * Pasa `monto` de la moneda `de` a la moneda `a` con la tasa dada (RD$ por US$). Misma moneda: igual.
 * Sin tasa y monedas distintas: null.
 */
export function convertir(monto: Big, de: Moneda, a: Moneda, tasa: TasaUsada | null): Big | null {
  if (de === a) return monto;
  if (!tasa) return null;
  return de === "USD" ? monto.times(tasa.valor) : monto.div(tasa.valor);
}

/** Último día de un mes «AAAA-MM» (para los fijos en US$: la tasa al cierre del mes, o la de hoy). */
export function finDeMes(mes: string): Fecha {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m, 0));
  return d.toISOString().slice(0, 10);
}

/** Texto corto de la tasa usada: «61.68 · BCRD 14 oct» o «60.50 · la que anotaste». */
export function describirTasa(t: TasaUsada | null): string {
  if (!t) return "sin tasa: no confirmado";
  if (t.origen === "propia") return `${new Big(t.valor).toFixed(2)} · la que anotaste`;
  return `${new Big(t.valor).toFixed(4)} · BCRD del ${t.fecha}`;
}
