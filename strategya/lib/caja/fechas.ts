// Fechas del Calendario de Caja. Todo se maneja como texto AAAA-MM-DD (día civil de RD), y la
// aritmética de días se hace en UTC para que ningún cambio de zona mueva un día.

export type Fecha = string; // AAAA-MM-DD
export type Mes = string; // AAAA-MM

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_MES = /^(\d{4})-(\d{2})$/;
const DIA_MS = 86_400_000;

/** ¿Es una fecha real del calendario (no 2026-02-30)? */
export function esFecha(v: unknown): v is Fecha {
  if (typeof v !== "string") return false;
  const m = RE_FECHA.exec(v);
  if (!m) return false;
  const [a, me, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return me >= 1 && me <= 12 && d >= 1 && d <= diasDelMes(a, me);
}

export function esMes(v: unknown): v is Mes {
  if (typeof v !== "string") return false;
  const m = RE_MES.exec(v);
  return !!m && Number(m[2]) >= 1 && Number(m[2]) <= 12;
}

/** Días del mes (mes 1–12). Febrero bisiesto incluido. */
export function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

function aUTC(f: Fecha): number {
  const [a, m, d] = f.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}

function deUTC(ms: number): Fecha {
  return new Date(ms).toISOString().slice(0, 10);
}

export function sumarDias(f: Fecha, n: number): Fecha {
  return deUTC(aUTC(f) + n * DIA_MS);
}

/** Días de `desde` a `hasta` (positivo si hasta es posterior). */
export function diasEntre(desde: Fecha, hasta: Fecha): number {
  return Math.round((aUTC(hasta) - aUTC(desde)) / DIA_MS);
}

export function mesDe(f: Fecha): Mes {
  return f.slice(0, 7);
}

export function primerDia(mes: Mes): Fecha {
  return `${mes}-01`;
}

export function ultimoDia(mes: Mes): Fecha {
  const [a, m] = mes.split("-").map(Number);
  return `${mes}-${String(diasDelMes(a, m)).padStart(2, "0")}`;
}

export function sumarMeses(mes: Mes, n: number): Mes {
  const [a, m] = mes.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Hoy en República Dominicana (UTC−4 todo el año). */
export function hoyRD(ahora: Date = new Date()): Fecha {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

/** Día de la semana con lunes = 0 … domingo = 6. */
export function diaSemanaLunes(f: Fecha): number {
  return (new Date(aUTC(f)).getUTCDay() + 6) % 7;
}

export function rangoFechas(desde: Fecha, hasta: Fecha): Fecha[] {
  const n = diasEntre(desde, hasta);
  const r: Fecha[] = [];
  for (let i = 0; i <= n; i++) r.push(sumarDias(desde, i));
  return r;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

export function nombreMes(mes: Mes): string {
  const [a, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} ${a}`;
}

/** "jueves 15 de octubre de 2026" */
export function fechaLarga(f: Fecha): string {
  const [a, m, d] = f.split("-").map(Number);
  return `${DIAS[diaSemanaLunes(f)]} ${d} de ${MESES[m - 1]} de ${a}`;
}

/** "15 oct" */
export function fechaBreve(f: Fecha): string {
  const [, m, d] = f.split("-").map(Number);
  return `${d} ${MESES[m - 1].slice(0, 3)}`;
}
