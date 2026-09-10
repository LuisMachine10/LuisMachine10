import { describe, expect, it } from 'vitest'
import { avisosDeFlujo, flujoDelMes, proyectarFlujo } from './flujo'
import { CUENTAS, MOVIMIENTOS, PRESUPUESTO, TASAS } from './fixture'
import { copiarPresupuesto } from './presupuesto'

const f = flujoDelMes(CUENTAS, MOVIMIENTOS, '2026-09', TASAS)

describe('flujo de caja', () => {
  it('parte del efectivo con que cerró el mes anterior', () => {
    expect(f.saldoInicial).toBe(192_000)
    expect(f.aperturas).toBe(0)
  })

  it('el mes de apertura muestra el saldo de entrada como renglón propio', () => {
    // Agosto: no hubo un solo asiento, pero entraron 192,000 de la libreta.
    const agosto = flujoDelMes(CUENTAS, MOVIMIENTOS, '2026-08', TASAS)
    expect(agosto.saldoInicial).toBe(0)
    expect(agosto.aperturas).toBe(192_000)
    expect(agosto.flujoNeto).toBe(0)   // no es flujo: ya estaba ahí
    expect(agosto.saldoFinal).toBe(192_000)
  })

  it('un traspaso entre cuentas de efectivo no es entrada ni salida', () => {
    // Los 6,000 del Popular al efectivo no inflan nada.
    expect(f.entradas).toBe(190_000)
    expect(f.salidas).toBe(129_300)
    expect(f.flujoNeto).toBe(60_700)
  })

  it('un gasto a crédito no toca caja el mes que se consume', () => {
    // Los 8,400 del súper con tarjeta son gasto de septiembre, salida de otro mes.
    expect(f.salidas).not.toContain(8_400)
    expect(f.operacion).toBe(123_200)
  })

  it('separa operación, inversión y financiamiento, y los tres suman el neto', () => {
    expect(f.operacion).toBe(123_200)
    expect(f.inversion).toBe(-31_500)      // el aporte al corretaje
    expect(f.financiamiento).toBe(-31_000) // abono a tarjeta + amortización
    expect(f.operacion + f.inversion + f.financiamiento).toBe(f.flujoNeto)
  })

  it('el resultado y la caja NO son lo mismo, y la diferencia se explica', () => {
    // Resultado 126,110 contra flujo 60,700. Los 65,410 de diferencia están en
    // el certificado que capitalizó, el corretaje, la deuda que bajó y el papel.
    expect(f.flujoNeto).not.toBe(126_110)
  })
})

describe('proyección', () => {
  const meses = ['2026-10', '2026-11', '2026-12']
  const ppto = [...PRESUPUESTO, ...copiarPresupuesto(PRESUPUESTO, '2026-09', meses)]
  const proy = proyectarFlujo(CUENTAS, MOVIMIENTOS, ppto, meses, TASAS, 252_700)

  it('encadena los meses: el saldo final de uno es el inicial del siguiente', () => {
    expect(proy[0].saldoInicial).toBe(252_700)
    expect(proy[0].flujoNeto).toBe(115_000)
    expect(proy[0].saldoFinal).toBe(367_700)
    expect(proy[1].saldoInicial).toBe(367_700)
    expect(proy[2].saldoFinal).toBe(597_700)
  })

  it('se rotula como proyección: no se confunde con lo que pasó', () => {
    expect(proy.every((p) => p.esProyeccion)).toBe(true)
    expect(f.esProyeccion).toBe(false)
  })

  it('avisa el mes en que la caja baja del colchón', () => {
    // Octubre cierra en 367,700: por debajo de 400,000, pero noviembre ya no.
    expect(avisosDeFlujo(proy, 400_000)).toHaveLength(1)
    expect(avisosDeFlujo(proy, 400_000)[0].mes).toBe('2026-10')
    expect(avisosDeFlujo(proy, 100_000)).toEqual([])
  })

  it('distingue quedarse sin caja de bajar del colchón', () => {
    const enRojo = proyectarFlujo(CUENTAS, MOVIMIENTOS, [], meses, TASAS, -5_000)
    expect(enRojo[0].saldoFinal).toBe(-5_000)
    expect(avisosDeFlujo(enRojo, 0)[0].mensaje).toMatch(/sin caja/)
  })
})
