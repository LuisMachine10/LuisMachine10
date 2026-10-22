// Armado de los paneles de República Dominicana (sin red, sin float). Las cifras llegan como texto
// desde Postgres (numeric::text) y solo se comparan o restan con big.js.

import Big from "big.js";
import { frescura } from "./frescura";

export const SERIES_DOLAR = ["USDDOP_COMPRA", "USDDOP_VENTA"] as const;

export const SERIES_MACRO_RD = ["TPM_BCRD", "INFLACION_RD", "INFLACION_SUB_RD"] as const;

/** Filas del boletín de tasas: [etiqueta, serie RD$, serie US$]. */
export const FILAS_ACTIVAS: readonly (readonly [string, string | null, string | null])[] = [
  ["Promedio ponderado (bancos múltiples)", "TASA_ACT_MN_PROMEDIO", null],
  ["Consumo · tarjeta de crédito", "TASA_ACT_MN_TARJETA", "TASA_ACT_ME_TARJETA"],
  ["Consumo · préstamos personales", "TASA_ACT_MN_CONSUMO", "TASA_ACT_ME_CONSUMO"],
  ["Comercial", "TASA_ACT_MN_COMERCIAL", "TASA_ACT_ME_COMERCIAL"],
  ["Hipotecaria (vivienda)", "TASA_ACT_MN_HIPOTECARIA", "TASA_ACT_ME_HIPOTECARIA"],
  ["Interbancaria", "TASA_ACT_MN_INTERBANCARIA", null],
];

export const FILAS_PASIVAS: readonly (readonly [string, string | null, string | null])[] = [
  ["Promedio ponderado (bancos múltiples)", "TASA_PAS_MN_PROMEDIO", null],
  ["Ahorro", "TASA_PAS_MN_AHORRO", "TASA_PAS_ME_AHORRO"],
  ["Plazo 30 días", "TASA_PAS_MN_30D", "TASA_PAS_ME_30D"],
  ["Plazo 180 días", "TASA_PAS_MN_180D", "TASA_PAS_ME_180D"],
  ["Plazo 1 año", "TASA_PAS_MN_360D", "TASA_PAS_ME_360D"],
  ["Plazo más de 1 año", "TASA_PAS_MN_MAS360D", "TASA_PAS_ME_MAS360D"],
];

export const SERIES_COMBUSTIBLES = [
  "COMB_GASOLINA_PREMIUM",
  "COMB_GASOLINA_REGULAR",
  "COMB_GASOIL_OPTIMO",
  "COMB_GASOIL_REGULAR",
  "COMB_GLP",
  "COMB_AVTUR",
  "COMB_KEROSENE",
  "COMB_FUEL_OIL_6",
  "COMB_FUEL_OIL_1S",
  "COMB_GAS_NATURAL",
] as const;

export const SERIES_TASAS: string[] = [...FILAS_ACTIVAS, ...FILAS_PASIVAS]
  .flatMap(([, mn, me]) => [mn, me])
  .filter((s): s is string => s !== null);

/** Tareas de ingesta del módulo (para el estado de cada panel). */
export const TAREAS_RD = ["bcrd-portada", "bcrd-excel", "credito-publico", "simv", "micm"] as const;

export interface SerieRD {
  id: string;
  nombre: string;
  nombre_corto: string;
  unidad: string;
  frecuencia: string;
  max_antiguedad_min: number;
  fuente_id: string;
  orden: number;
}

export interface ObsRD {
  serie_id: string;
  valor: string;
  cambio: string | null;
  fecha_dato: string;
  recogido_en: string;
  url_dato: string | null;
  fuente_id: string;
}

export interface FuenteRD {
  id: string;
  nombre: string;
  url: string;
}

export interface DatoRD {
  serie: SerieRD;
  obs: ObsRD;
  /** Observación anterior (para mostrar contra qué se compara el cambio). */
  anterior: ObsRD | null;
  fuente: FuenteRD;
  desactualizado: boolean;
}

const FUENTE_DESCONOCIDA: FuenteRD = { id: "?", nombre: "Fuente sin registrar", url: "" };

/** Último dato de cada serie, con su fuente (la de la observación: «manual» si la cargó Mena). */
export function ultimosDatos(series: SerieRD[], obs: ObsRD[], fuentes: FuenteRD[], ahora: Date): Map<string, DatoRD> {
  const porSerie = new Map<string, ObsRD[]>();
  for (const o of obs) {
    const lista = porSerie.get(o.serie_id);
    if (lista) lista.push(o);
    else porSerie.set(o.serie_id, [o]);
  }
  const fuentePorId = new Map(fuentes.map((f) => [f.id, f]));
  const salida = new Map<string, DatoRD>();
  for (const s of series) {
    const lista = (porSerie.get(s.id) ?? []).slice().sort((a, b) => b.fecha_dato.localeCompare(a.fecha_dato));
    const [ultima, previa] = lista;
    if (!ultima) continue;
    salida.set(s.id, {
      serie: s,
      obs: ultima,
      anterior: previa ?? null,
      fuente: fuentePorId.get(ultima.fuente_id) ?? FUENTE_DESCONOCIDA,
      desactualizado: frescura({ fecha_dato: ultima.fecha_dato }, s.max_antiguedad_min, ahora).desactualizado,
    });
  }
  return salida;
}

/** Historial reciente de una serie, del más nuevo al más viejo. */
export function historial(obs: ObsRD[], serie: string, n: number): ObsRD[] {
  return obs
    .filter((o) => o.serie_id === serie)
    .sort((a, b) => b.fecha_dato.localeCompare(a.fecha_dato))
    .slice(0, n);
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-08-31" → "agosto 2026" (dato mensual). */
export function mesLargo(fecha: string): string {
  const [a, m] = fecha.split("-").map(Number);
  return `${MESES[m - 1]} ${a}`;
}

/** "2026-08-31" → "ago 2026". */
export function mesCorto(fecha: string): string {
  const [a, m] = fecha.split("-").map(Number);
  return `${MESES_CORTOS[m - 1]} ${a}`;
}

/** Semana de vigencia de un precio de combustible: "2026-10-10" → "10–16 oct 2026". */
export function semanaVigencia(inicio: string): string {
  const d = new Date(`${inicio}T00:00:00Z`);
  const fin = new Date(d.getTime() + 6 * 86_400_000);
  const di = d.getUTCDate();
  const df = fin.getUTCDate();
  const mi = MESES_CORTOS[d.getUTCMonth()];
  const mf = MESES_CORTOS[fin.getUTCMonth()];
  const af = fin.getUTCFullYear();
  if (mi === mf) return `${di}–${df} ${mf} ${af}`;
  return d.getUTCFullYear() === af ? `${di} ${mi} – ${df} ${mf} ${af}` : `${di} ${mi} ${d.getUTCFullYear()} – ${df} ${mf} ${af}`;
}

/** Diferencia venta − compra del BCRD (mismo día), exacta. Null si los días no coinciden. */
export function brechaCambiaria(compra: ObsRD | undefined, venta: ObsRD | undefined): string | null {
  if (!compra || !venta || compra.fecha_dato !== venta.fecha_dato) return null;
  return new Big(venta.valor).minus(compra.valor).toFixed();
}

/** Cambio en puntos porcentuales para una tasa: "0.25" → +0.25 p.p.; null si no hay. */
export function cambioTasa(dato: DatoRD | undefined): string | null {
  return dato?.obs.cambio ?? null;
}

// ---------------------------------------------------------------------------
// Fondos de inversión (carga manual)
// ---------------------------------------------------------------------------

export interface FilaFondo {
  id: number;
  safi: string;
  fondo: string;
  moneda: "DOP" | "USD";
  plazo_dias: number;
  rendimiento: string;
  fecha_corte: string;
  url_fuente: string;
  nota: string | null;
  /** Valor de la cuota en la fecha de corte (si la SAFI lo publica). */
  valor_cuota?: string | null;
  origen?: "manual" | "automatica";
  fuente_id?: string | null;
}

export interface GrupoSafi {
  safi: string;
  fondos: FilaFondo[];
  ultimoCorte: string;
}

/** Último corte de cada fondo (por moneda y base de días), agrupado por SAFI en orden alfabético. */
export function fondosPorSafi(filas: FilaFondo[]): GrupoSafi[] {
  const ultimos = new Map<string, FilaFondo>();
  for (const f of filas) {
    const clave = `${f.safi}\u0000${f.fondo}\u0000${f.moneda}\u0000${f.plazo_dias}`;
    const previa = ultimos.get(clave);
    if (!previa || f.fecha_corte > previa.fecha_corte) ultimos.set(clave, f);
  }
  const grupos = new Map<string, FilaFondo[]>();
  for (const f of ultimos.values()) {
    const g = grupos.get(f.safi);
    if (g) g.push(f);
    else grupos.set(f.safi, [f]);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "es"))
    .map(([safi, fondos]) => ({
      safi,
      fondos: fondos.sort((a, b) => a.fondo.localeCompare(b.fondo, "es") || a.moneda.localeCompare(b.moneda) || a.plazo_dias - b.plazo_dias),
      ultimoCorte: fondos.map((f) => f.fecha_corte).sort().at(-1)!,
    }));
}

// ---------------------------------------------------------------------------
// Fondos de Inversión en el Mercado de Valores de RD (vista con filtros)
// ---------------------------------------------------------------------------

/** Un fondo se marca «Dato viejo» si su corte tiene más de 10 días. */
export const MAX_FONDO_MIN = 14_400;

/** SAFIs cuyas páginas aún no se leen solas: sus fondos se agregan a mano. */
export const SAFIS_A_MANO = ["Universal", "Popular", "Pioneer", "BHD"] as const;

export interface CifraFondo {
  rendimiento: string;
  plazo_dias: number;
  fecha_corte: string;
  url: string;
  manual: boolean;
}

/** Un fondo (SAFI + nombre + moneda) con su rendimiento a 30 días y a 1 año (base 360 o 365). */
export interface FondoVista {
  clave: string;
  safi: string;
  fondo: string;
  moneda: "DOP" | "USD";
  r30: CifraFondo | null;
  r1a: CifraFondo | null;
  valorCuota: { valor: string; fecha_corte: string } | null;
  /** Corte más reciente de las cifras mostradas. */
  corte: string;
  url: string;
  manual: boolean;
  fuenteId: string | null;
  viejo: boolean;
}

/**
 * Último corte de cada fondo, solo con las bases de 30 días y de 1 año (360 o 365 días; si hay ambas,
 * la de corte más reciente). Las demás bases (60/90/180) no se muestran. Sin cálculos: cifras tal cual.
 */
export function fondosVista(filas: FilaFondo[], ahora: Date): FondoVista[] {
  const porFondo = new Map<string, FilaFondo[]>();
  for (const f of filas) {
    if (![30, 360, 365].includes(f.plazo_dias)) continue;
    const clave = `${f.safi}\u0000${f.fondo}\u0000${f.moneda}`;
    const g = porFondo.get(clave);
    if (g) g.push(f);
    else porFondo.set(clave, [f]);
  }
  const ultima = (lista: FilaFondo[]) =>
    lista.slice().sort((a, b) => b.fecha_corte.localeCompare(a.fecha_corte) || b.plazo_dias - a.plazo_dias || b.id - a.id)[0];
  const cifraDe = (f: FilaFondo | undefined): CifraFondo | null =>
    f ? { rendimiento: f.rendimiento, plazo_dias: f.plazo_dias, fecha_corte: f.fecha_corte, url: f.url_fuente, manual: (f.origen ?? "manual") === "manual" } : null;
  const salida: FondoVista[] = [];
  for (const [clave, lista] of porFondo) {
    const a30 = ultima(lista.filter((f) => f.plazo_dias === 30));
    const a1 = ultima(lista.filter((f) => f.plazo_dias !== 30));
    const conCuota = ultima(lista.filter((f) => f.valor_cuota));
    const base = ultima([a30, a1].filter((x): x is FilaFondo => !!x));
    salida.push({
      clave,
      safi: base.safi,
      fondo: base.fondo,
      moneda: base.moneda,
      r30: cifraDe(a30),
      r1a: cifraDe(a1),
      valorCuota: conCuota?.valor_cuota ? { valor: conCuota.valor_cuota, fecha_corte: conCuota.fecha_corte } : null,
      corte: base.fecha_corte,
      url: base.url_fuente,
      manual: (base.origen ?? "manual") === "manual",
      fuenteId: base.fuente_id ?? null,
      viejo: frescura({ fecha_dato: base.fecha_corte }, MAX_FONDO_MIN, ahora).desactualizado,
    });
  }
  return salida.sort((a, b) => a.safi.localeCompare(b.safi, "es") || a.fondo.localeCompare(b.fondo, "es") || a.moneda.localeCompare(b.moneda));
}

export interface FiltroFondos {
  safi: string; // "" = todas
  moneda: "" | "DOP" | "USD";
  /** "30" o "1a": solo fondos con ese rendimiento. "ambos": todos (se ordena por 30 días). */
  periodo: "ambos" | "30" | "1a";
  orden: "mayor" | "menor" | "nombre";
}

/**
 * Filtra y ordena los fondos. El periodo decide qué rendimiento se ordena; con «ambos», el de 30 días,
 * y los fondos sin él quedan al final (nunca se rellenan). Comparación exacta con big.js.
 */
export function filtrarFondos(lista: FondoVista[], f: FiltroFondos): FondoVista[] {
  const elegido = (x: FondoVista) => (f.periodo === "1a" ? x.r1a : x.r30);
  const filtrados = lista.filter(
    (x) =>
      (!f.safi || x.safi === f.safi) &&
      (!f.moneda || x.moneda === f.moneda) &&
      (f.periodo === "ambos" || (f.periodo === "30" ? x.r30 : x.r1a) !== null),
  );
  const porNombre = (a: FondoVista, b: FondoVista) => a.fondo.localeCompare(b.fondo, "es") || a.safi.localeCompare(b.safi, "es") || a.moneda.localeCompare(b.moneda);
  if (f.orden === "nombre") return filtrados.sort(porNombre);
  return filtrados.sort((a, b) => {
    const ra = elegido(a);
    const rb = elegido(b);
    if (!ra || !rb) return ra ? -1 : rb ? 1 : porNombre(a, b);
    const c = new Big(ra.rendimiento).cmp(rb.rendimiento);
    return (f.orden === "mayor" ? -c : c) || porNombre(a, b);
  });
}

// ---------------------------------------------------------------------------
// Euro en pesos: el BCRD no publica EUR/DOP. Cruce calculado = dólar del BCRD × EUR/USD del BCE.
// ---------------------------------------------------------------------------

export interface PuntoEuro {
  /** Fecha de la tasa del BCE. */
  fecha: string;
  /** Fecha del dólar del BCRD usado (el último publicado en o antes de esa fecha). */
  fechaDolar: string;
  eurusd: string;
  venta: string;
  compra: string | null;
}

/** Días máximos entre la tasa del BCE y el dólar del BCRD con que se cruza (fin de semana + feriado). */
export const MAX_DIAS_CRUCE = 3;

/**
 * Cruce EUR/DOP = USD/DOP × EUR/USD, a 4 decimales (big.js, redondeo a la mitad hacia arriba).
 * Para cada fecha del BCE se usa el dólar del BCRD de esa fecha o el último anterior (hasta 3 días
 * antes); si no hay, esa fecha queda sin cruce. Nunca es un dato oficial: la pantalla lo rotula.
 */
export function cruceEuro(obs: ObsRD[], eurusd: ObsRD[]): PuntoEuro[] {
  const venta = historial(obs, "USDDOP_VENTA", 400);
  const compra = new Map(historial(obs, "USDDOP_COMPRA", 400).map((o) => [o.fecha_dato, o]));
  const porFecha = new Map<string, ObsRD>();
  for (const e of eurusd) if (!porFecha.has(e.fecha_dato)) porFecha.set(e.fecha_dato, e);
  const salida: PuntoEuro[] = [];
  for (const e of [...porFecha.values()].sort((a, b) => b.fecha_dato.localeCompare(a.fecha_dato))) {
    const v = venta.find((o) => o.fecha_dato <= e.fecha_dato);
    if (!v) continue;
    const dias = (Date.parse(`${e.fecha_dato}T00:00:00Z`) - Date.parse(`${v.fecha_dato}T00:00:00Z`)) / 86_400_000;
    if (dias > MAX_DIAS_CRUCE) continue;
    const c = compra.get(v.fecha_dato);
    const por = (x: string) => new Big(x).times(e.valor).round(4, Big.roundHalfUp).toFixed(4);
    salida.push({ fecha: e.fecha_dato, fechaDolar: v.fecha_dato, eurusd: e.valor, venta: por(v.valor), compra: c ? por(c.valor) : null });
  }
  return salida;
}

// ---------------------------------------------------------------------------
// Validación de la carga manual (la base vuelve a validar; esto da mensajes claros antes)
// ---------------------------------------------------------------------------

export type Validacion<T> = { ok: true; valor: T } | { ok: false; error: string };

/** "5.25" o "1525.40". Rechaza comas (en RD la coma separa miles) y notación científica. */
export function validarDecimal(texto: string, campo: string, opciones: { positivo?: boolean } = {}): Validacion<string> {
  const s = texto.trim();
  if (!s) return { ok: false, error: `Falta ${campo}.` };
  if (/,/.test(s)) return { ok: false, error: `${campo}: usa punto decimal y sin comas de miles (p. ej. 1525.40).` };
  if (!/^-?\d+(\.\d+)?$/.test(s)) return { ok: false, error: `${campo}: «${s}» no es un número.` };
  if (opciones.positivo && new Big(s).lte(0)) return { ok: false, error: `${campo} debe ser mayor que cero.` };
  return { ok: true, valor: new Big(s).toFixed() === "-0" ? "0" : s };
}

export function validarFecha(texto: string, campo: string): Validacion<string> {
  const s = texto.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, error: `${campo}: usa el formato AAAA-MM-DD.` };
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return { ok: false, error: `${campo}: la fecha no existe.` };
  return { ok: true, valor: s };
}

export function validarEnlace(texto: string): Validacion<string> {
  const s = texto.trim();
  if (!s) return { ok: false, error: "Falta el enlace de la fuente: cada dato manual lleva de dónde salió." };
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
    return { ok: true, valor: u.toString() };
  } catch {
    return { ok: false, error: "El enlace de la fuente debe empezar con https://" };
  }
}
