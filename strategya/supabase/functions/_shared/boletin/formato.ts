// Formato de cifras y fechas del Boletín. Mismas reglas que lib/formato.ts de la app (las cifras llegan
// como texto y se redondean con big.js: nunca pasan por float), en un módulo que también corre en Deno.

import Big from "big.js";

export const ZONA_RD = "America/Santo_Domingo";
export const MENOS = "−";

function conMiles(entero: string): string {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** "4107.9" → "4,107.90" con `decimales` fijos; redondeo mitad hacia arriba. */
export function cifra(texto: string, decimales: number): string {
  const fijo = new Big(texto).toFixed(decimales, Big.roundHalfUp);
  const negativo = fijo.startsWith("-");
  const [entero, frac] = (negativo ? fijo.slice(1) : fijo).split(".");
  const cuerpo = frac ? `${conMiles(entero)}.${frac}` : conMiles(entero);
  return negativo && !new Big(fijo).eq(0) ? `${MENOS}${cuerpo}` : cuerpo;
}

/** Con signo visible: "+0.05", "−0.05", "0.00". */
export function cifraConSigno(texto: string, decimales: number): string {
  const base = cifra(texto, decimales);
  if (base.startsWith(MENOS)) return base;
  return new Big(new Big(texto).toFixed(decimales, Big.roundHalfUp)).eq(0) ? base : `+${base}`;
}

export function pctConSigno(texto: string, decimales = 2): string {
  return `${cifraConSigno(texto, decimales)} %`;
}

/** Cambio de una tasa (en puntos porcentuales) dicho en puntos básicos: "-0.05" → "−5 pb". */
export function puntosBasicos(cambio: string): string {
  return `${cifraConSigno(new Big(cambio).times(100).toString(), 0)} pb`;
}

export function direccionDe(cambio: string | null | undefined): "sube" | "baja" | "igual" | null {
  if (cambio === null || cambio === undefined || !/^-?\d+(\.\d+)?$/.test(cambio)) return null;
  const c = new Big(cambio);
  return c.gt(0) ? "sube" : c.lt(0) ? "baja" : "igual";
}

const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIA_CORTO = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const DIA_LARGO = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function partes(fecha: string): { a: number; m: number; d: number; dow: number } {
  const [a, m, d] = fecha.slice(0, 10).split("-").map((x) => Number.parseInt(x, 10));
  return { a, m, d, dow: new Date(Date.UTC(a, m - 1, d)).getUTCDay() };
}

/** "2026-10-24" → "24 oct" (o "24 oct 2026"). Fecha de la fuente: no se mueve de día por zona horaria. */
export function fechaCorta(fecha: string, conAnio = false): string {
  const p = partes(fecha);
  return `${p.d} ${MES_CORTO[p.m - 1]}${conAnio ? ` ${p.a}` : ""}`;
}

/** "2026-10-24" → "vie 24 oct". */
export function fechaConDia(fecha: string): string {
  const p = partes(fecha);
  return `${DIA_CORTO[p.dow]} ${p.d} ${MES_CORTO[p.m - 1]}`;
}

/** "2026-10-26" → "lunes 26 de octubre de 2026". */
export function fechaLarga(fecha: string): string {
  const p = partes(fecha);
  return `${DIA_LARGO[p.dow]} ${p.d} de ${MES_LARGO[p.m - 1]} de ${p.a}`;
}

/** Dato mensual (fechado el último día del mes): "2026-09-30" → "sep 2026". */
export function mesCorto(fecha: string): string {
  const p = partes(fecha);
  return `${MES_CORTO[p.m - 1]} ${p.a}`;
}

/** "2026-10" → "octubre". */
export function nombreMes(mes: string): string {
  return MES_LARGO[Number.parseInt(mes.slice(5, 7), 10) - 1] ?? mes;
}

/** Día AAAA-MM-DD de un instante en hora RD. */
export function diaRD(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_RD, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** Hora RD: "7:35 AM". */
export function horaRD(iso: string | Date): string {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: ZONA_RD, hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(new Date(iso));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${v("hour")}:${v("minute")} ${v("dayPeriod").toUpperCase()}`;
}

/** «hoy», «ayer» o «el vie 24 oct». */
export function cuandoEs(fecha: string, hoy: string): string {
  if (fecha === hoy) return "hoy";
  const ayer = new Date(`${hoy}T12:00:00Z`);
  ayer.setUTCDate(ayer.getUTCDate() - 1);
  if (fecha === ayer.toISOString().slice(0, 10)) return "ayer";
  return `el ${fechaConDia(fecha)}`;
}

/** «dato de hoy», «dato de ayer», «dato del vie 24 oct». */
export function datoDe(fecha: string, hoy: string): string {
  const c = cuandoEs(fecha, hoy);
  return c.startsWith("el ") ? `dato del ${c.slice(3)}` : `dato de ${c}`;
}

export function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Quita claves de API de un enlace (nunca debe ir una en un correo). */
export function enlaceSeguro(url: string | null | undefined): string | null {
  if (!url || !/^https?:\/\/[^\s]+$/.test(url)) return null;
  if (/[?&](apikey|api_key|token|key|secret)=/i.test(url)) return null;
  return url;
}
