import { describe, expect, it } from 'vitest'
import { CUENTAS, MOVIMIENTOS, TASAS } from './fixture'
import { compararSituacion, estadoSituacion, indicadores } from './situacion'

const cierre = estadoSituacion(CUENTAS, MOVIMIENTOS, '2026-09-30', TASAS)
const apertura = estadoSituacion(CUENTAS, MOVIMIENTOS, '2026-08-31', TASAS)

describe('estado de situación', () => {
  it('suma los activos convirtiendo cada cuenta desde su moneda', () => {
    // 234,700 + 18,000 + 503,750 + (4,620 USD × 63)
    expect(cierre.totalActivos).toBe(1_047_510)
  })

  it('suma los pasivos y saca el patrimonio como la diferencia', () => {
    expect(cierre.totalPasivos).toBe(642_400)
    expect(cierre.patrimonio).toBe(405_110)
    expect(cierre.patrimonio).toBe(cierre.totalActivos - cierre.totalPasivos)
  })

  it('presenta los activos en orden de liquidez', () => {
    expect(cierre.activos.map((b) => b.grupo)).toEqual(['EFECTIVO', 'CERTIFICADO', 'INVERSION'])
  })

  it('separa la caja de verdad de lo que solo parece líquido', () => {
    // El certificado no es caja aunque sea del banco.
    expect(cierre.caja).toBe(252_700)
    expect(cierre.deudaCorto).toBe(33_400)
  })

  it('guarda la tasa junto al estado: un total convertido sin su tasa no se defiende', () => {
    expect(cierre.tasas.usd).toBe(63)
  })

  it('no muestra renglones en cero', () => {
    const conCuentaVacia = estadoSituacion(
      [...CUENTAS, { ...CUENTAS[0], id: 99, nombre: 'Cuenta nueva', saldoInicial: 0 }],
      MOVIMIENTOS, '2026-09-30', TASAS,
    )
    expect(conCuentaVacia.activos.flatMap((b) => b.renglones).some((r) => r.cuentaId === 99)).toBe(false)
  })
})

describe('indicadores', () => {
  const ind = indicadores(cierre, 75_200)

  it('endeudamiento: cuánto de lo que tienes no es tuyo', () => {
    expect(ind.endeudamiento).toBe(0.61)
  })

  it('liquidez: la caja contra lo exigible ya', () => {
    expect(ind.liquidez).toBe(7.57)
  })

  it('meses de colchón: cuánto aguantas sin que entre un peso', () => {
    expect(ind.mesesDeColchon).toBe(3.36)
  })

  it('devuelve null en vez de inventar cuando el denominador es cero', () => {
    const vacio = indicadores({ ...cierre, totalActivos: 0, deudaCorto: 0 }, 0)
    expect(vacio.endeudamiento).toBeNull()
    expect(vacio.liquidez).toBeNull()
    expect(vacio.mesesDeColchon).toBeNull()
  })
})

describe('comparación: ninguna cifra viaja sola', () => {
  it('dice qué cambió y cuánto, no solo dónde quedó', () => {
    const v = compararSituacion(apertura, cierre)
    const patrimonio = v.find((x) => x.nombre === 'Patrimonio')!
    expect(patrimonio.antes).toBe(279_000)
    expect(patrimonio.ahora).toBe(405_110)
    expect(patrimonio.cambio).toBe(126_110)
    expect(patrimonio.cambioPct).toBe(45.2)
  })

  it('no divide entre cero: sin base, el porcentaje es null', () => {
    const v = compararSituacion({ ...apertura, patrimonio: 0 }, cierre)
    expect(v.find((x) => x.nombre === 'Patrimonio')!.cambioPct).toBeNull()
  })
})
