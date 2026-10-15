// Horarios de los mercados (puro, sin red, sin Deno ni Node): ¿está abierto ahora?, ¿cuál fue la última
// sesión?, ¿a qué día de negociación pertenece un instante? y ¿cuántos minutos con el mercado abierto pasaron
// entre dos momentos? Las zonas horarias (y con ellas el horario de verano de Nueva York y de Europa) las
// resuelve Intl con la base de datos IANA del runtime.
//
// Lo usan la ingesta (qué refrescar y qué fecha_dato poner) y la pantalla (frescura: el reloj de
// «desactualizado» solo corre con el mercado abierto). La app lo reexporta desde lib/mercados.ts.

export type Mercado = "us_acciones" | "futuros" | "fx" | "cripto" | "europa" | "asia";

export const MERCADOS: readonly Mercado[] = ["us_acciones", "futuros", "fx", "cripto", "europa", "asia"];

interface Definicion {
  nombre: string;
  zona: string;
  /** Días de la semana con sesión (0 = domingo), en la fecha local de la sesión. */
  dias: readonly number[];
  /** Inicio: [días respecto del día de negociación, minutos desde medianoche local]. */
  inicio: readonly [number, number];
  fin: readonly [number, number];
  /** Días sin sesión (AAAA-MM-DD, fecha local). */
  feriados?: ReadonlySet<string>;
  /** Cierres anticipados: día → minuto local de cierre. */
  cierresTempranos?: Readonly<Record<string, number>>;
}

// NYSE · calendario oficial (https://www.nyse.com/markets/hours-calendars). Revisar cada año.
// Un año que no esté aquí se trata como si no tuviera feriados (el panel podría marcar «desactualizado»
// un feriado; nunca inventa un precio).
const FERIADOS_NYSE = new Set([
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03",
  "2026-09-07", "2026-11-26", "2026-12-25",
  // 2027
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05",
  "2027-09-06", "2027-11-25", "2027-12-24",
]);
const CIERRES_TEMPRANOS_NYSE: Record<string, number> = {
  "2026-11-27": 13 * 60,
  "2026-12-24": 13 * 60,
  "2027-11-26": 13 * 60,
};

const LV = [1, 2, 3, 4, 5] as const;

const DEFINICIONES: Readonly<Record<Mercado, Definicion>> = {
  // NYSE / Nasdaq, horario regular 9:30–16:00 de Nueva York.
  us_acciones: {
    nombre: "Acciones de EE. UU.",
    zona: "America/New_York",
    dias: LV,
    inicio: [0, 9 * 60 + 30],
    fin: [0, 16 * 60],
    feriados: FERIADOS_NYSE,
    cierresTempranos: CIERRES_TEMPRANOS_NYSE,
  },
  // CME Globex (oro, plata, petróleo, gas): de 18:00 del día anterior a 17:00 de Nueva York, L–V.
  // La pausa diaria de 17:00 a 18:00 queda entre una sesión y la siguiente. Feriados de CME no incluidos.
  futuros: { nombre: "Futuros (CME Globex)", zona: "America/New_York", dias: LV, inicio: [-1, 18 * 60], fin: [0, 17 * 60] },
  // Divisas: de domingo 17:00 a viernes 17:00 de Nueva York, sin pausa.
  fx: { nombre: "Divisas", zona: "America/New_York", dias: LV, inicio: [-1, 17 * 60], fin: [0, 17 * 60] },
  // Cripto: 24/7. El día de negociación es el día UTC.
  cripto: { nombre: "Cripto", zona: "UTC", dias: [0, 1, 2, 3, 4, 5, 6], inicio: [0, 0], fin: [1, 0] },
  // Londres 8:00–16:30 = Xetra/Euronext 9:00–17:30 (Europa cambia de horario el mismo día en ambos).
  europa: { nombre: "Europa", zona: "Europe/London", dias: LV, inicio: [0, 8 * 60], fin: [0, 16 * 60 + 30] },
  // Tokio 9:00 (apertura) a 17:00 (= cierre de Hong Kong 16:00). Las pausas de mediodía no se descuentan.
  asia: { nombre: "Asia", zona: "Asia/Tokyo", dias: LV, inicio: [0, 9 * 60], fin: [0, 17 * 60] },
};

export function esMercado(x: unknown): x is Mercado {
  return typeof x === "string" && (MERCADOS as readonly string[]).includes(x);
}

export function nombreMercado(m: Mercado): string {
  return DEFINICIONES[m].nombre;
}

export function zonaMercado(m: Mercado): string {
  return DEFINICIONES[m].zona;
}

// ───────────────────────── fechas locales ─────────────────────────

const formateadores = new Map<string, Intl.DateTimeFormat>();

function formateador(zona: string): Intl.DateTimeFormat {
  let f = formateadores.get(zona);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zona,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formateadores.set(zona, f);
  }
  return f;
}

interface PartesLocales {
  anio: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
}

function partes(t: Date, zona: string): PartesLocales {
  const p: Record<string, string> = {};
  for (const x of formateador(zona).formatToParts(t)) p[x.type] = x.value;
  return {
    anio: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    hora: Number(p.hour) % 24,
    minuto: Number(p.minute),
    segundo: Number(p.second),
  };
}

const dos = (n: number) => String(n).padStart(2, "0");

/** Fecha local AAAA-MM-DD de un instante en una zona. */
export function fechaLocal(t: Date, zona: string): string {
  const p = partes(t, zona);
  return `${p.anio}-${dos(p.mes)}-${dos(p.dia)}`;
}

export function sumarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

export function diaSemana(dia: string): number {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/** Minutos que la zona va adelante de UTC en el instante t (Nueva York en verano: −240). */
function desfaseMin(t: Date, zona: string): number {
  const p = partes(t, zona);
  const comoUtc = Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  return Math.round((comoUtc - Math.floor(t.getTime() / 1000) * 1000) / 60_000);
}

/** Instante UTC de la hora local `minutos` (desde medianoche) del día `dia` en `zona`. */
export function instanteLocal(dia: string, minutos: number, zona: string): Date {
  const [a, m, d] = dia.split("-").map(Number);
  const ingenuo = Date.UTC(a, m - 1, d, 0, minutos);
  let t = ingenuo - desfaseMin(new Date(ingenuo), zona) * 60_000;
  t = ingenuo - desfaseMin(new Date(t), zona) * 60_000;
  return new Date(t);
}

// ───────────────────────── sesiones ─────────────────────────

export interface Sesion {
  /** Día de negociación (fecha local del mercado) al que pertenece la sesión. */
  dia: string;
  inicio: Date;
  fin: Date;
}

/** La sesión del día de negociación `dia`, o null si ese día no hay mercado. */
export function sesionDe(mercado: Mercado, dia: string): Sesion | null {
  const def = DEFINICIONES[mercado];
  if (!def.dias.includes(diaSemana(dia))) return null;
  if (def.feriados?.has(dia)) return null;
  const finMin = def.cierresTempranos?.[dia] ?? def.fin[1];
  return {
    dia,
    inicio: instanteLocal(sumarDias(dia, def.inicio[0]), def.inicio[1], def.zona),
    fin: instanteLocal(sumarDias(dia, def.fin[0]), finMin, def.zona),
  };
}

export interface EstadoMercado {
  abierto: boolean;
  /** Si está abierto: la sesión en curso. Si está cerrado: la última que terminó. */
  sesion: Sesion | null;
  proximaApertura: Date | null;
}

const BUSQUEDA_DIAS = 15;

export function estadoMercado(mercado: Mercado, ahora: Date): EstadoMercado {
  const hoy = fechaLocal(ahora, DEFINICIONES[mercado].zona);
  const t = ahora.getTime();
  let proxima: Date | null = null;
  for (let i = -1; i <= BUSQUEDA_DIAS; i++) {
    const s = sesionDe(mercado, sumarDias(hoy, i));
    if (!s) continue;
    if (s.inicio.getTime() <= t && t < s.fin.getTime()) {
      return { abierto: true, sesion: s, proximaApertura: null };
    }
    if (s.inicio.getTime() > t) {
      proxima = s.inicio;
      break;
    }
  }
  for (let i = 1; i <= BUSQUEDA_DIAS; i++) {
    const s = sesionDe(mercado, sumarDias(hoy, 2 - i));
    if (s && s.fin.getTime() <= t) return { abierto: false, sesion: s, proximaApertura: proxima };
  }
  return { abierto: false, sesion: null, proximaApertura: proxima };
}

export function estaAbierto(mercado: Mercado, ahora: Date): boolean {
  return estadoMercado(mercado, ahora).abierto;
}

/**
 * Día de negociación de un dato tomado en el instante t: el de la sesión en curso o, con el mercado
 * cerrado, el de la última sesión (el precio que se ve es su cierre).
 */
export function diaNegociacion(mercado: Mercado, t: Date): string {
  return estadoMercado(mercado, t).sesion?.dia ?? fechaLocal(t, DEFINICIONES[mercado].zona);
}

/** Minutos con el mercado abierto entre `desde` y `hasta` (como máximo 15 días hacia atrás). */
export function minutosAbiertos(mercado: Mercado, desde: Date, hasta: Date): number {
  const a = Math.max(desde.getTime(), hasta.getTime() - BUSQUEDA_DIAS * 86_400_000);
  const b = hasta.getTime();
  if (b <= a) return 0;
  const zona = DEFINICIONES[mercado].zona;
  const primero = sumarDias(fechaLocal(new Date(a), zona), -1);
  const ultimo = sumarDias(fechaLocal(new Date(b), zona), 2);
  let total = 0;
  for (let dia = primero; dia <= ultimo; dia = sumarDias(dia, 1)) {
    const s = sesionDe(mercado, dia);
    if (!s) continue;
    const solape = Math.min(b, s.fin.getTime()) - Math.max(a, s.inicio.getTime());
    if (solape > 0) total += solape;
  }
  return Math.floor(total / 60_000);
}

// ───────────────────────── frescura de series intradía ─────────────────────────

export type EstadoFrescura = "al_dia" | "cerrado" | "desactualizado";

export interface FrescuraIntradia {
  estado: EstadoFrescura;
  /** Minutos con el mercado abierto desde el dato. */
  minutosAbiertos: number;
  mercadoAbierto: boolean;
}

/**
 * Un dato intradía se vence solo con el mercado abierto: si pasaron más de `maxAntiguedadMin` minutos de
 * mercado abierto desde el dato, está desactualizado. Con el mercado cerrado y el dato al día, es el cierre.
 */
export function frescuraIntradia(horaDato: Date, maxAntiguedadMin: number, mercado: Mercado, ahora: Date): FrescuraIntradia {
  const minutos = minutosAbiertos(mercado, horaDato, ahora);
  const abierto = estaAbierto(mercado, ahora);
  if (minutos > maxAntiguedadMin) return { estado: "desactualizado", minutosAbiertos: minutos, mercadoAbierto: abierto };
  return { estado: abierto ? "al_dia" : "cerrado", minutosAbiertos: minutos, mercadoAbierto: abierto };
}
