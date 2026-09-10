import { describe, expect, it } from 'vitest'
import { asientoValuacion, enDOP, naturaleza, saldo, validarMovimiento } from './cuentas'
import { CUENTAS, MOVIMIENTOS, TASAS } from './fixture'
import type { Cuenta, Movimiento } from './tipos'

const cuenta = (id: number) => CUENTAS.find((c) => c.id === id)!
const alCierre = { hasta: '2026-09-30' }

describe('naturaleza de las cuentas', () => {
  it('activos y gastos son deudores; pasivos, patrimonio e ingresos, acreedores', () => {
    expect(naturaleza('ACTIVO')).toBe('DEUDORA')
    expect(naturaleza('GASTO')).toBe('DEUDORA')
    expect(naturaleza('PASIVO')).toBe('ACREEDORA')
    expect(naturaleza('PATRIMONIO')).toBe('ACREEDORA')
    expect(naturaleza('INGRESO')).toBe('ACREEDORA')
  })
})

describe('saldos', () => {
  it('un activo parte de su saldo inicial y se mueve con los asientos', () => {
    // 180,000 + 190,000 de salario − 135,300 de salidas
    expect(saldo(cuenta(1), MOVIMIENTOS, alCierre)).toBe(234_700)
    expect(saldo(cuenta(2), MOVIMIENTOS, alCierre)).toBe(18_000)
  })

  it('un pasivo se muestra positivo: es lo que debes, no un activo negativo', () => {
    // Tarjeta: 45,000 + 8,400 de consumo − 20,000 de abono
    expect(saldo(cuenta(10), MOVIMIENTOS, alCierre)).toBe(33_400)
    expect(saldo(cuenta(11), MOVIMIENTOS, alCierre)).toBe(609_000)
  })

  it('cada cuenta se lleva en su propia moneda', () => {
    expect(saldo(cuenta(4), MOVIMIENTOS, alCierre)).toBe(4_620)
    expect(enDOP(4_620, 'USD', TASAS)).toBe(291_060)
    expect(enDOP(4_620, 'DOP', TASAS)).toBe(4_620)
  })

  it('las cuentas de resultados solo acumulan dentro de la ventana', () => {
    const septiembre = { desde: '2026-09-01', hasta: '2026-09-30' }
    expect(saldo(cuenta(20), MOVIMIENTOS, septiembre)).toBe(190_000)
    expect(saldo(cuenta(32), MOVIMIENTOS, septiembre)).toBe(17_500)
    // Octubre no tuvo movimientos: la cuenta de resultados vuelve a cero.
    expect(saldo(cuenta(20), MOVIMIENTOS, { desde: '2026-10-01', hasta: '2026-10-31' })).toBe(0)
  })

  it('las cuentas de balance acumulan siempre desde el origen, sin ventana', () => {
    // Aunque se pida solo octubre, el banco arrastra lo de septiembre.
    expect(saldo(cuenta(1), MOVIMIENTOS, { desde: '2026-10-01', hasta: '2026-10-31' })).toBe(234_700)
  })

  it('una cuenta que todavía no abrió no aporta saldo', () => {
    expect(saldo(cuenta(1), MOVIMIENTOS, { hasta: '2026-08-30' })).toBe(0)
    expect(saldo(cuenta(1), MOVIMIENTOS, { hasta: '2026-08-31' })).toBe(180_000)
  })
})

describe('validación de asientos', () => {
  const base: Movimiento = {
    fecha: '2026-09-15', descripcion: 'x', monto: 100, debe: 32, haber: 1,
    origen: 'manual', conciliado: false,
  }

  it('acepta un asiento correcto', () => {
    expect(validarMovimiento(base, CUENTAS)).toBeNull()
  })

  it('rechaza un monto que no sea mayor que cero', () => {
    expect(validarMovimiento({ ...base, monto: 0 }, CUENTAS)).toMatch(/mayor que cero/)
    expect(validarMovimiento({ ...base, monto: -100 }, CUENTAS)).toMatch(/mayor que cero/)
  })

  it('rechaza una cuenta contra sí misma y una cuenta inexistente', () => {
    expect(validarMovimiento({ ...base, debe: 1, haber: 1 }, CUENTAS)).toMatch(/sí misma/)
    expect(validarMovimiento({ ...base, debe: 999 }, CUENTAS)).toMatch(/no existe/)
  })

  it('exige los dos montos cuando el asiento cruza monedas', () => {
    const cruzado = { ...base, debe: 4, haber: 1, monto: 500 }
    expect(validarMovimiento(cruzado, CUENTAS)).toMatch(/los dos lados/)
    expect(validarMovimiento({ ...cruzado, montoHaber: 31_500 }, CUENTAS)).toBeNull()
  })
})

describe('valuación a mercado', () => {
  const corretaje: Cuenta = cuenta(4)

  it('arma el asiento que lleva la cuenta al valor de mercado', () => {
    // Cierra en 4,620 USD; si el mercado dice 5,000, faltan 380 de ganancia.
    const a = asientoValuacion(corretaje, 5_000, '2026-09-30', MOVIMIENTOS, 22)!
    expect(a.monto).toBe(380)
    expect(a.debe).toBe(4)
    expect(a.haber).toBe(22)
    expect(a.origen).toBe('valuacion')
  })

  it('invierte el asiento cuando el mercado bajó', () => {
    const a = asientoValuacion(corretaje, 4_000, '2026-09-30', MOVIMIENTOS, 22)!
    expect(a.monto).toBe(620)
    expect(a.debe).toBe(22)
    expect(a.haber).toBe(4)
  })

  it('no ensucia el libro si ya está en ese valor', () => {
    expect(asientoValuacion(corretaje, 4_620, '2026-09-30', MOVIMIENTOS, 22)).toBeNull()
  })
})
