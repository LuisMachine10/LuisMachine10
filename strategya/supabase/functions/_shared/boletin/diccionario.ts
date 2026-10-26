// Diccionarios fijos del Boletín: palabras clave por serie (para el «¿Por qué?») y el glosario rotativo.
// Nada de esto lo escribe una IA: son listas a mano. Las definiciones no llevan cifras.

import type { TitularGuardado } from "./tipos.ts";

/**
 * Palabras que, si aparecen en un titular guardado, lo relacionan con la serie (en inglés y en español,
 * porque los medios son de los dos idiomas). Se comparan sin mayúsculas ni tildes y como palabra entera.
 */
export const PALABRAS_CLAVE: Readonly<Record<string, readonly string[]>> = {
  IDX_SPX: ["s&p 500", "s&p", "wall street", "us stocks", "u.s. stocks", "stocks", "acciones de ee. uu.", "bolsa de nueva york"],
  IDX_DJI: ["dow jones", "dow"],
  IDX_IXIC: ["nasdaq", "tech stocks", "tecnologicas"],
  IDX_RUT: ["russell", "small caps", "small-cap"],
  IDX_STOXX50E: ["stoxx", "european stocks", "europe stocks", "bolsas europeas", "bolsas de europa"],
  IDX_FTSE: ["ftse", "london stocks", "bolsa de londres"],
  IDX_GDAXI: ["dax", "german stocks", "bolsa alemana"],
  IDX_N225: ["nikkei", "japanese stocks", "tokyo stocks", "bolsa de tokio"],
  IDX_HSI: ["hang seng", "hong kong stocks", "bolsa de hong kong"],
  UST_2A: ["treasury", "treasuries", "yields", "bond yields", "bonos del tesoro", "rendimientos"],
  UST_10A: ["treasury", "treasuries", "yields", "bond yields", "10-year", "bonos del tesoro", "rendimientos"],
  DXY: ["dollar index", "dollar", "dolar", "greenback"],
  ETF_UUP: ["dollar index", "dollar", "dolar", "greenback"],
  EURUSD: ["euro", "eur/usd"],
  USDJPY: ["yen", "usd/jpy"],
  BRENT: ["brent", "oil", "crude", "petroleo", "crudo", "opec", "opep"],
  WTI: ["wti", "oil", "crude", "petroleo", "crudo", "opec", "opep"],
  GAS_NATURAL: ["natural gas", "gas natural", "lng", "gnl"],
  ORO: ["gold", "oro", "bullion"],
  PLATA: ["silver", "plata"],
  COBRE_CPER: ["copper", "cobre"],
  BTC: ["bitcoin", "crypto", "cripto", "criptomonedas"],
  USDDOP_VENTA: ["tasa de cambio", "dolar", "divisas"],
  TPM_BCRD: ["tasa de politica monetaria", "tpm", "banco central"],
};

/** Minúsculas y sin tildes (para comparar). */
export function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PATRONES = new Map<string, RegExp>();
function patron(serie: string): RegExp | null {
  const palabras = PALABRAS_CLAVE[serie];
  if (!palabras?.length) return null;
  let p = PATRONES.get(serie);
  if (!p) {
    p = new RegExp(`(?<![\\p{L}\\p{N}])(${palabras.map((w) => escapar(normalizar(w))).join("|")})(?![\\p{L}\\p{N}])`, "u");
    PATRONES.set(serie, p);
  }
  return p;
}

/** ¿El titular menciona la serie? */
export function mencionaSerie(serie: string, titular: string): boolean {
  const p = patron(serie);
  return p ? p.test(normalizar(titular)) : false;
}

/**
 * El titular guardado más reciente (de las últimas `horas` antes de `ahora`) que menciona la serie.
 * null = ninguno: el Boletín dice «causa no confirmada». Nunca se inventa una explicación.
 */
export function titularQueMenciona(serie: string, titulares: readonly TitularGuardado[], ahora: Date, horas = 24): TitularGuardado | null {
  const desde = ahora.getTime() - horas * 3_600_000;
  let mejor: TitularGuardado | null = null;
  for (const t of titulares) {
    const f = new Date(t.fecha).getTime();
    if (f < desde || f > ahora.getTime()) continue;
    if (!mencionaSerie(serie, t.titular)) continue;
    if (!mejor || f > new Date(mejor.fecha).getTime() || (f === new Date(mejor.fecha).getTime() && t.id > mejor.id)) mejor = t;
  }
  return mejor;
}

// ───────────────────────────── Glosario rotativo ─────────────────────────────

/** Tema de la edición que trae el concepto (se elige solo si esa sección tiene dato). */
export type TemaGlosario =
  | "bolsas" | "tesoro" | "dolar" | "energia" | "metales" | "dolar_rd" | "tpm" | "inflacion" | "combustibles"
  | "subastas" | "fondos" | "tasas_bancos" | "guerras" | "tu_dinero" | "semana";

export interface ConceptoGlosario {
  id: string;
  termino: string;
  definicion: string;
  temas: readonly TemaGlosario[];
}

export const GLOSARIO_BOLETIN: readonly ConceptoGlosario[] = [
  { id: "indice", termino: "Índice bursátil", definicion: "Indicador que resume el precio de un grupo de acciones; sube cuando la mayoría de esas acciones sube.", temas: ["bolsas"] },
  { id: "rendimiento", termino: "Rendimiento de un bono", definicion: "Lo que gana al año quien compra el bono hoy; si el rendimiento sube, el precio del bono baja.", temas: ["tesoro"] },
  { id: "pb", termino: "Punto básico", definicion: "La centésima parte de un punto porcentual; se usa para medir cambios pequeños de tasas.", temas: ["tesoro", "tpm", "tasas_bancos"] },
  { id: "dxy", termino: "Índice del dólar", definicion: "Mide el dólar frente a una canasta de monedas de países ricos; si sube, el dólar está más fuerte.", temas: ["dolar"] },
  { id: "brent", termino: "Brent", definicion: "Petróleo de referencia internacional; su precio pesa en lo que se paga por los combustibles en RD.", temas: ["energia", "combustibles"] },
  { id: "refugio", termino: "Activo refugio", definicion: "Activo que la gente busca cuando hay miedo, como el oro o los bonos del Tesoro de EE. UU.", temas: ["metales", "guerras"] },
  { id: "tasa-referencia", termino: "Tasa de referencia del dólar", definicion: "Promedio de compra y venta de dólares que publica el Banco Central con las operaciones del mercado.", temas: ["dolar_rd"] },
  { id: "tpm", termino: "TPM", definicion: "Tasa de política monetaria: la que fija el Banco Central para orientar el costo del dinero en el país.", temas: ["tpm"] },
  { id: "inflacion", termino: "Inflación interanual", definicion: "Cuánto subieron los precios frente al mismo mes del año pasado.", temas: ["inflacion"] },
  { id: "tasa-corte", termino: "Tasa de corte", definicion: "En una subasta de bonos, la tasa más alta que aceptó el emisor; fija lo que paga esa emisión.", temas: ["subastas"] },
  { id: "tasa-pasiva", termino: "Tasa pasiva", definicion: "La que pagan los bancos por tus depósitos; la activa es la que cobran por sus préstamos.", temas: ["tasas_bancos"] },
  { id: "fondo-abierto", termino: "Fondo abierto", definicion: "Fondo de inversión en el que puedes entrar y salir cuando quieras; uno cerrado tiene cuotas fijas y plazo.", temas: ["fondos"] },
  { id: "base-dias", termino: "Base de días", definicion: "Indica el período con que se anualiza un rendimiento; dos cifras con bases distintas no se comparan directo.", temas: ["fondos"] },
  { id: "prima-geopolitica", termino: "Prima geopolítica", definicion: "Parte del precio del petróleo o del oro que refleja el miedo a un conflicto.", temas: ["guerras", "energia"] },
  { id: "patrimonio-neto", termino: "Patrimonio neto", definicion: "Lo que tienes menos lo que debes.", temas: ["tu_dinero"] },
  { id: "cierre-semanal", termino: "Cierre semanal", definicion: "El último precio del viernes; compararlo con el del viernes anterior dice cómo terminó la semana.", temas: ["semana"] },
];

/** Día del año (1–366) de una fecha AAAA-MM-DD: hace que el glosario rote cada día de forma fija. */
export function diaDelAnio(fecha: string): number {
  const d = Date.UTC(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)) - 1, Number(fecha.slice(8, 10)));
  const ini = Date.UTC(Number(fecha.slice(0, 4)), 0, 1);
  return Math.floor((d - ini) / 86_400_000) + 1;
}

/** Elige de 1 a `cuantos` conceptos entre los de los temas con dato; mismos datos y día → mismos conceptos. */
export function elegirConceptos(temas: ReadonlySet<TemaGlosario>, fecha: string, cuantos: number): ConceptoGlosario[] {
  const aptos = GLOSARIO_BOLETIN.filter((c) => c.temas.some((t) => temas.has(t)));
  if (!aptos.length) return [];
  const inicio = diaDelAnio(fecha) % aptos.length;
  const salida: ConceptoGlosario[] = [];
  for (let i = 0; i < aptos.length && salida.length < Math.max(1, cuantos); i++) salida.push(aptos[(inicio + i) % aptos.length]);
  return salida;
}
