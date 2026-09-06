import type { CargaSemana, Ejercicio } from './tipos'

export interface CargaInterpretada {
  /** Peso objetivo en libras, cuando la celda lo expresa en peso. */
  pesoLb: number | null
  /** Repeticiones objetivo de la serie tope. */
  reps: number | null
  /** Series, cuando la celda es "series × reps" y no "peso × reps". */
  series: number | null
  /** Discos por lado, para el remo en máquina. */
  discosPorLado: number | null
  /** El texto original de la hoja, para mostrarlo tal cual. */
  texto: string
}

const VACIA: CargaInterpretada = {
  pesoLb: null, reps: null, series: null, discosPorLado: null, texto: '',
}

/**
 * Traduce una celda de la hoja PROGRESION.
 *
 *   "225 lb x 5"   → 225 lb × 5 reps
 *   "3x8 @ 185"    → 3 series × 8 reps a 185 lb
 *   "5.0 x 10"     → 5 discos por lado × 10 reps (remo en máquina)
 *   "5 x 6"        → 5 series × 6 reps (dominadas, sin peso)
 *   "680 x 6"      → 680 lb × 6 reps
 *   "DELOAD + retest" → sin números, solo texto
 */
export function interpretarCarga(texto: string, clave?: string | null): CargaInterpretada {
  const t = (texto ?? '').trim()
  if (!t || t === '—') return { ...VACIA, texto: t }

  // "3x8 @ 185" — series de descarga
  const backoff = t.match(/^(\d+)\s*x\s*(\d+)\s*@\s*(\d+)/i)
  if (backoff) {
    return {
      pesoLb: Number(backoff[3]), reps: Number(backoff[2]),
      series: Number(backoff[1]), discosPorLado: null, texto: t,
    }
  }

  // "185 lb x 5 (2 series)"
  const conLb = t.match(/^([\d.]+)\s*lb\s*x\s*(\d+)(?:\s*\((\d+)\s*series?\))?/i)
  if (conLb) {
    return {
      pesoLb: Number(conLb[1]), reps: Number(conLb[2]),
      series: conLb[3] ? Number(conLb[3]) : null, discosPorLado: null, texto: t,
    }
  }

  // "5.0 x 10" o "590 x 8" — el significado depende de la columna.
  const simple = t.match(/^([\d.]+)\s*x\s*(\d+)/i)
  if (simple) {
    const n = Number(simple[1])
    const reps = Number(simple[2])
    if (clave === 'remoMaquina') return { ...VACIA, discosPorLado: n, reps, texto: t }
    // Un número pequeño sin unidad son series, no libras: "5 x 6" dominadas.
    if (n <= 12) return { ...VACIA, series: n, reps, texto: t }
    return { ...VACIA, pesoLb: n, reps, texto: t }
  }

  return { ...VACIA, texto: t }
}

const CAMPOS: Record<string, keyof CargaSemana> = {
  pressBancaTope: 'pressBancaTope',
  remoMaquina: 'remoMaquina',
  prensaPiernas: 'prensaPiernas',
  empujeCadera: 'empujeCadera',
  rdlHex: 'rdlHex',
  dominadas: 'dominadas',
  pechadas: 'pechadas',
}

/** La carga objetivo de un ejercicio en una semana concreta del plan. */
export function cargaObjetivo(
  ejercicio: Ejercicio, semana: CargaSemana | undefined,
): CargaInterpretada | null {
  if (!semana || !ejercicio.claveProgresion) return null
  const campo = CAMPOS[ejercicio.claveProgresion]
  if (!campo) return null
  return interpretarCarga(String(semana[campo] ?? ''), ejercicio.claveProgresion)
}

/** Discos de 45 lb por lado, sin contar la barra o el carro de la máquina. */
export function librosDeDiscos(discosPorLado: number): number {
  return discosPorLado * 45 * 2
}
