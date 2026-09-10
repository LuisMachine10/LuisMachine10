import { describe, expect, it } from 'vitest'
import { CUENTAS, MOVIMIENTOS, TASAS } from './fixture'
import { estadoResultados, promedioMensual, serieResultados } from './resultados'

const sep = estadoResultados(CUENTAS, MOVIMIENTOS, '2026-09', TASAS)

describe('estado de resultados', () => {
  it('suma ingresos y gastos del mes', () => {
    expect(sep.totalIngresos).toBe(201_310)
    expect(sep.totalGastos).toBe(75_200)
    expect(sep.resultado).toBe(126_110)
  })

  it('separa fijo de variable: es lo que hace presupuestable el mes siguiente', () => {
    expect(sep.ingresoFijo).toBe(190_000)
    expect(sep.ingresoVariable).toBe(11_310)
    expect(sep.gastoFijo).toBe(53_500)
    expect(sep.gastoVariable).toBe(21_700)
  })

  it('separa lo realizado de lo que solo existe en papel', () => {
    // La acción subió 120 USD; te hizo más rico, pero no pagó la luz.
    expect(sep.noRealizado).toBe(7_560)
    expect(sep.resultadoRealizado).toBe(118_550)
  })

  it('calcula la tasa de ahorro sobre lo realizado, no sobre la ganancia de papel', () => {
    expect(sep.tasaAhorro).toBe(61.19)
    // Si contara lo no realizado daría 62.6: más alta y falsa.
    expect(sep.tasaAhorro).toBeLessThan((sep.resultado / sep.totalIngresos) * 100)
  })

  it('ordena los renglones por monto y dice cuánto pesa cada uno', () => {
    expect(sep.gastos[0].nombre).toBe('Vivienda')
    expect(sep.gastos[0].pesoPct).toBe(46.54)
    expect(sep.gastos.reduce((a, r) => a + r.pesoPct, 0)).toBeCloseTo(100, 1)
  })

  it('no muestra cuentas sin movimiento', () => {
    expect(sep.ingresos.every((r) => r.monto !== 0)).toBe(true)
  })
})

describe('promedio mensual — la métrica es el promedio, no el mes suelto', () => {
  const serie = serieResultados(CUENTAS, MOVIMIENTOS, ['2026-08', '2026-09', '2026-10'], TASAS)

  it('un mes sin registrar no es un mes en cero: no entra al promedio', () => {
    const p = promedioMensual(serie)
    expect(p.meses).toBe(1)
    expect(p.gastos).toBe(75_200)
    // Si contara agosto y octubre como ceros, daría 25,067 y sería mentira.
  })

  it('devuelve ceros y null, no NaN, cuando no hay nada que promediar', () => {
    const p = promedioMensual([])
    expect(p.meses).toBe(0)
    expect(p.gastos).toBe(0)
    expect(p.tasaAhorro).toBeNull()
  })
})
