// Fechas de Mena Capital: días calendario (AAAA-MM-DD) y meses (AAAA-MM), en hora de RD.

const ZONA_RD = "America/Santo_Domingo";
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const RE_FECHA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export function esFecha(s: unknown): s is string {
  if (typeof s !== "string" || !RE_FECHA.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function esMes(s: unknown): boolean {
  return typeof s === "string" && RE_MES.test(s);
}

/** Hoy en RD: "2026-10-15". */
export function hoyRD(ahora: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_RD, year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}

export function mesDe(fecha: string): string {
  return fecha.slice(0, 7);
}

export function mesPrevio(k: string): string {
  let [y, m] = k.split("-").map(Number);
  m--;
  if (m < 1) {
    m = 12;
    y--;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function mesSiguiente(k: string): string {
  let [y, m] = k.split("-").map(Number);
  m++;
  if (m > 12) {
    m = 1;
    y++;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function mesesEntre(a: string, b: string): number {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

/** Días calendario de a a b (fechas AAAA-MM-DD). */
export function dias(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function aniosEntre(a: string, b: string): number {
  return dias(a, b) / 365.25;
}

export function mesLargo(k: string): string {
  const [y, m] = k.split("-");
  return `${MESES[Number(m) - 1]} ${y}`;
}

/** Último día del mes: "2026-02" → "2026-02-28". */
export function finDeMes(k: string): string {
  const [y, m] = k.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Fecha a n meses de otra, el mismo día (o el último del mes si no existe): ("2026-01-31", 1) → "2026-02-28". */
export function sumarMeses(fecha: string, n: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(d, ultimo));
  return base.toISOString().slice(0, 10);
}

export function mesCorto(k: string): string {
  const [y, m] = k.split("-");
  return `${MESES[Number(m) - 1].slice(0, 3).toLowerCase()} ${y.slice(2)}`;
}
