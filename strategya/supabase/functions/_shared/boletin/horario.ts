// Horario de las 4 ediciones. Las horas se escriben en hora de República Dominicana (America/Santo_Domingo,
// UTC−4 todo el año, sin horario de verano) y se convierten a UTC para pg_cron. La migración
// 20261026000100_boletin.sql usa exactamente estas expresiones (una prueba lo verifica).

import type { TipoEdicion } from "./tipos.ts";

/** RD está 4 horas detrás de UTC todo el año. */
export const DESFASE_RD_HORAS = -4;

export interface Horario {
  nombre: string;
  /** Días de la semana en que sale (0 = domingo … 6 = sábado), en hora RD. */
  dias: readonly number[];
  hora: number;
  minuto: number;
  /** A qué hora debe estar en el buzón (hora RD). */
  llegaAntes: string;
  /** Límite de palabras del correo. */
  palabras: number;
}

export const EDICIONES: Readonly<Record<TipoEdicion, Horario>> = {
  am: { nombre: "Bitácora Financiera · AM", dias: [1, 2, 3, 4, 5], hora: 7, minuto: 35, llegaAntes: "8:00 AM", palabras: 650 },
  cierre: { nombre: "Bitácora Financiera · Cierre", dias: [1, 2, 3, 4, 5], hora: 17, minuto: 5, llegaAntes: "5:30 PM", palabras: 650 },
  finde: { nombre: "Bitácora Financiera · Fin de semana · Materias primas", dias: [6, 0], hora: 7, minuto: 35, llegaAntes: "8:00 AM", palabras: 650 },
  tasas: { nombre: "Boletín de Tasas RD", dias: [1], hora: 6, minuto: 40, llegaAntes: "7:00 AM", palabras: 500 },
};

/** Minutos de la segunda pasada (solo reenvía si la primera falló). */
export const MINUTOS_REINTENTO = 10;

export function nombreTarea(tipo: TipoEdicion): string {
  return `boletin-${tipo}`;
}

/** Hora RD → hora UTC, con el corrimiento de día si cruza la medianoche. */
export function rdAUtc(hora: number, minuto: number): { hora: number; minuto: number; dia: number } {
  let h = hora - DESFASE_RD_HORAS;
  let dia = 0;
  if (h >= 24) {
    h -= 24;
    dia = 1;
  }
  return { hora: h, minuto, dia };
}

function listaDias(dias: readonly number[]): string {
  const orden = [...new Set(dias)].sort((a, b) => a - b);
  const corrido = orden.length > 2 && orden.every((d, i) => i === 0 || d === orden[i - 1] + 1);
  return corrido ? `${orden[0]}-${orden.at(-1)}` : orden.join(",");
}

/** Expresión de pg_cron (UTC) de una edición; `demora` en minutos para la pasada de reintento. */
export function cronUtc(tipo: TipoEdicion, demora = 0): string {
  const e = EDICIONES[tipo];
  const total = e.hora * 60 + e.minuto + demora;
  const u = rdAUtc(Math.floor(total / 60), total % 60);
  const dias = e.dias.map((d) => (d + u.dia) % 7);
  return `${u.minuto} ${u.hora} * * ${listaDias(dias)}`;
}

/** Día de la semana en hora RD (0 = domingo). */
export function diaSemanaRD(ahora: Date): number {
  const corrido = new Date(ahora.getTime() + DESFASE_RD_HORAS * 3_600_000);
  return corrido.getUTCDay();
}

/** Fecha AAAA-MM-DD en hora RD. */
export function fechaRD(ahora: Date): string {
  return new Date(ahora.getTime() + DESFASE_RD_HORAS * 3_600_000).toISOString().slice(0, 10);
}

/** ¿Esta edición sale el día (RD) de `ahora`? Una corrida manual en otro día se omite. */
export function tocaHoy(tipo: TipoEdicion, ahora: Date): boolean {
  return EDICIONES[tipo].dias.includes(diaSemanaRD(ahora));
}

/** Clave de idempotencia para Resend: el mismo correo nunca sale dos veces aunque se repita la tarea. */
export function claveIdempotencia(tipo: TipoEdicion, fecha: string, pruebaId?: number | null): string {
  return pruebaId ? `strategya-boletin-${tipo}-prueba-${pruebaId}` : `strategya-boletin-${tipo}-${fecha}`;
}
