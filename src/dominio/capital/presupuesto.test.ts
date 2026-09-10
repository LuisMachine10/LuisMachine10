import { describe, expect, it } from 'vitest'
import { CUENTAS, MOVIMIENTOS, PRESUPUESTO, TASAS } from './fixture'
import { compararPresupuesto, copiarPresupuesto, sugerirPresupuesto } from './presupuesto'

const c = compararPresupuesto(CUENTAS, MOVIMIENTOS, PRESUPUESTO, '2026-09', TASAS)
const buscar = (nombre: string) =>
  [...c.ingresos, ...c.gastos].find((v) => v.nombre === nombre)!

describe('presupuesto contra realidad', () => {
  it('suma los dos lados y la varianza del resultado', () => {
    expect(c.ingresosPpto).toBe(193_500)
    expect(c.ingresosReal).toBe(201_310)
    expect(c.gastosPpto).toBe(78_500)
    expect(c.gastosReal).toBe(75_200)
    expect(c.resultadoPpto).toBe(115_000)
    expect(c.resultadoReal).toBe(126_110)
    expect(c.varianzaResultado).toBe(11_110)
  })

  it('gastar de menos es favorable; ingresar de menos, no', () => {
    // Aquí es donde falla casi todo dashboard: el signo no decide el juicio.
    const alimentacion = buscar('Alimentación')
    expect(alimentacion.varianza).toBe(-2_500)
    expect(alimentacion.favorable).toBe(true)

    const salarioCorto = compararPresupuesto(
      CUENTAS, MOVIMIENTOS,
      PRESUPUESTO.map((l) => (l.cuentaId === 20 ? { ...l, monto: 200_000 } : l)),
      '2026-09', TASAS,
    ).ingresos.find((v) => v.nombre === 'Salario')!
    expect(salarioCorto.varianza).toBe(-10_000)
    expect(salarioCorto.favorable).toBe(false)
  })

  it('marca lo que ocurrió sin estar presupuestado', () => {
    const noRealizada = buscar('Ganancia no realizada')
    expect(noRealizada.noPresupuestado).toBe(true)
    expect(noRealizada.varianzaPct).toBeNull()
  })

  it('calcula el porcentaje contra lo presupuestado', () => {
    expect(buscar('Transporte').varianzaPct).toBe(-16)
    expect(buscar('Intereses de certificado').varianzaPct).toBe(7.14)
  })

  it('pone adelante las tres desviaciones que más pesan en pesos', () => {
    expect(c.mayoresDesviaciones.map((v) => v.nombre))
      .toEqual(['Ganancia no realizada', 'Alimentación', 'Transporte'])
  })

  it('no lista cuentas sin presupuesto ni movimiento', () => {
    expect([...c.ingresos, ...c.gastos].every((v) => v.presupuestado !== 0 || v.real !== 0)).toBe(true)
  })
})

describe('armar el año sin teclear doce veces', () => {
  it('copia un mes a los que se le indiquen', () => {
    const copiado = copiarPresupuesto(PRESUPUESTO, '2026-09', ['2026-10', '2026-11'])
    expect(copiado).toHaveLength(12)
    expect(copiado.filter((l) => l.mes === '2026-10')).toHaveLength(6)
    expect(copiado.find((l) => l.mes === '2026-11' && l.cuentaId === 30)!.monto).toBe(35_000)
  })
})

describe('presupuesto sugerido desde lo que de verdad gastas', () => {
  const sugerido = sugerirPresupuesto(CUENTAS, MOVIMIENTOS, ['2026-08', '2026-09'], '2026-10', TASAS)

  it('promedia solo los meses con movimiento', () => {
    const alimentacion = sugerido.find((l) => l.cuentaId === 32)!
    expect(alimentacion.monto).toBe(17_500)
    expect(alimentacion.mes).toBe('2026-10')
  })

  it('cada línea trae su procedencia: es sugerencia, no dato guardado', () => {
    expect(sugerido.find((l) => l.cuentaId === 32)!.nota).toBe('Promedio de 1 mes con movimiento')
  })

  it('no sugiere cuentas que nunca se movieron', () => {
    expect(sugerido.some((l) => l.cuentaId === 1)).toBe(false)
  })
})
