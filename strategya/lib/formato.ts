// Formato de cifras y fechas para la pantalla. Las cifras llegan como texto desde Postgres
// (numeric::text) y se redondean con aritmética decimal: nunca pasan por float.

import Big from "big.js";

export const ZONA_RD = "America/Santo_Domingo";
const MENOS = "−"; // signo menos tipográfico

function conMiles(entero: string): string {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** "4107.9" → "4,107.90" con `decimales` fijos; redondeo mitad hacia arriba. */
export function cifra(texto: string, decimales: number): string {
  const fijo = new Big(texto).toFixed(decimales, Big.roundHalfUp);
  const negativo = fijo.startsWith("-");
  const [entero, frac] = (negativo ? fijo.slice(1) : fijo).split(".");
  const cuerpo = frac ? `${conMiles(entero)}.${frac}` : conMiles(entero);
  const esCero = new Big(fijo).eq(0);
  return negativo && !esCero ? `${MENOS}${cuerpo}` : cuerpo;
}

/** Con signo siempre visible: "+0.05", "−0.05", "0.00". */
export function cifraConSigno(texto: string, decimales: number): string {
  const base = cifra(texto, decimales);
  if (base.startsWith(MENOS)) return base;
  return new Big(texto).toFixed(decimales, Big.roundHalfUp).match(/^-?0(\.0+)?$/) ? base : `+${base}`;
}

/** Cambio de una tasa en puntos básicos: "-0.05" → "−5 pb". */
export function puntosBasicos(cambio: string): string {
  return `${cifraConSigno(new Big(cambio).times(100).toString(), 0)} pb`;
}

export type Direccion = "sube" | "baja" | "igual";

export function direccion(cambio: string | null | undefined): Direccion {
  if (cambio == null) return "igual";
  const c = new Big(cambio);
  return c.gt(0) ? "sube" : c.lt(0) ? "baja" : "igual";
}

/** "2026-10-14" → "14 oct 2026" (fecha de la fuente, sin mover de día por zona horaria). */
export function fechaCorta(fecha: string, conAnio = true): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  const f = new Intl.DateTimeFormat("es-DO", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    ...(conAnio ? { year: "numeric" } : {}),
  }).format(d);
  return f.replace(" de ", " ").replace(".", "");
}

/** Hora RD: "6:15 p. m." */
export function horaRD(iso: string | Date): string {
  return new Intl.DateTimeFormat("es-DO", { timeZone: ZONA_RD, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** Fecha y hora RD completas, para el atributo title: "jue, 15 oct, 6:15 p. m." */
export function fechaHoraRD(iso: string | Date): string {
  return new Intl.DateTimeFormat("es-DO", {
    timeZone: ZONA_RD,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** "hace instantes", "hace 12 min", "hace 3 h 5 min", "hace 2 d". */
export function hace(iso: string | Date, ahora: Date): string {
  const min = Math.floor((ahora.getTime() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "hace instantes";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `hace ${h} h ${min % 60} min` : `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}
