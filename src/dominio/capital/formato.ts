/**
 * Cómo se escriben las cifras. Vive en el dominio y lleva prueba porque un
 * número mal formateado es un número mal leído, y de ahí sale una mala decisión.
 */
const SEPARADOR = new Intl.NumberFormat('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const CON_CENTAVOS = new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Montos en pesos. Sin centavos por defecto: a nivel de estados, los centavos
 * son ruido que estorba para comparar columnas.
 */
export function monto(n: number, conCentavos = false): string {
  const f = conCentavos ? CON_CENTAVOS : SEPARADOR
  return f.format(conCentavos ? n : Math.round(n))
}

export function montoRD(n: number, conCentavos = false): string {
  return `RD$ ${monto(n, conCentavos)}`
}

/** Con el signo siempre delante: en una variación, el signo ES el dato. */
export function montoConSigno(n: number): string {
  const redondeado = Math.round(n)
  if (redondeado === 0) return '0'
  return `${redondeado > 0 ? '+' : '−'}${monto(Math.abs(n))}`
}

/** Para ejes de gráficas, donde no cabe el número completo. */
export function montoCorto(n: number): string {
  const abs = Math.abs(n)
  const signo = n < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${signo}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}MM`
  if (abs >= 1_000) return `${signo}${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}K`
  return `${signo}${Math.round(abs)}`
}

export function pct(n: number | null, decimales = 1): string {
  if (n === null || !Number.isFinite(n)) return '—'
  return `${n.toFixed(decimales)}%`
}

export function pctConSigno(n: number | null, decimales = 1): string {
  if (n === null || !Number.isFinite(n)) return '—'
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(decimales)}%`
}

/** Un valor que no existe se muestra como raya, nunca como cero. */
export function oRaya(n: number | null | undefined, formatear: (x: number) => string): string {
  return n === null || n === undefined || !Number.isFinite(n) ? '—' : formatear(n)
}
