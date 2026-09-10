/**
 * La prueba que justifica toda la arquitectura.
 *
 * Si estas pruebas pasan, el estado de situación, el de resultados y el flujo
 * de caja no pueden contradecirse — no porque alguien los revise, sino porque
 * salen del mismo libro. Si alguna falla, hay un número equivocado camino a una
 * decisión, y hay que parar.
 */
import { describe, expect, it } from 'vitest'
import { articular, cuadrarCaja, revisarLibro } from './articulacion'
import { CUENTAS, MOVIMIENTOS, TASAS } from './fixture'
import { estadoSituacion } from './situacion'
import type { Movimiento } from './tipos'

describe('los tres estados cuentan la misma historia', () => {
  const a = articular(CUENTAS, MOVIMIENTOS, '2026-09', TASAS)

  it('patrimonio final = patrimonio inicial + resultado, al centavo', () => {
    expect(a.patrimonioInicial).toBe(279_000)
    expect(a.resultado).toBe(126_110)
    expect(a.patrimonioFinal).toBe(405_110)
    expect(a.esperado).toBe(405_110)
    expect(a.diferencia).toBe(0)
    expect(a.cuadra).toBe(true)
  })

  it('la caja del flujo es la misma caja del balance', () => {
    const c = cuadrarCaja(CUENTAS, MOVIMIENTOS, '2026-09', TASAS)
    expect(c.cajaSegunFlujo).toBe(252_700)
    expect(c.cajaSegunSituacion).toBe(252_700)
    expect(c.cuadra).toBe(true)
  })

  it('sigue cuadrando mes a mes, no solo en el mes que se probó', () => {
    for (const mes of ['2026-08', '2026-09', '2026-10', '2026-11']) {
      expect(articular(CUENTAS, MOVIMIENTOS, mes, TASAS).cuadra).toBe(true)
      expect(cuadrarCaja(CUENTAS, MOVIMIENTOS, mes, TASAS).cuadra).toBe(true)
    }
  })

  it('un asiento nuevo cualquiera no puede descuadrarlo', () => {
    const extra: Movimiento[] = [
      ...MOVIMIENTOS,
      { fecha: '2026-09-14', descripcion: 'Consulta médica', monto: 6_500, debe: 33, haber: 10, origen: 'manual', conciliado: false },
      { fecha: '2026-09-16', descripcion: 'Venta de un mueble', monto: 15_000, debe: 2, haber: 21, origen: 'manual', conciliado: false },
      { fecha: '2026-09-29', descripcion: 'Compra de certificado', monto: 50_000, debe: 3, haber: 1, origen: 'manual', conciliado: false },
    ]
    const b = articular(CUENTAS, extra, '2026-09', TASAS)
    expect(b.diferencia).toBe(0)
    expect(cuadrarCaja(CUENTAS, extra, '2026-09', TASAS).cuadra).toBe(true)
  })

  it('el mes de apertura cuadra: la libreta entrando no descuadra nada', () => {
    const a8 = articular(CUENTAS, MOVIMIENTOS, '2026-08', TASAS)
    expect(a8.patrimonioInicial).toBe(0)
    expect(a8.aperturas).toBe(279_000)
    expect(a8.patrimonioFinal).toBe(279_000)
    expect(a8.cuadra).toBe(true)
  })

  it('cuenta aportes y retiros de patrimonio por separado del resultado', () => {
    const cuentas = [...CUENTAS, {
      ...CUENTAS[0], id: 40, nombre: 'Capital', clase: 'PATRIMONIO' as const,
      grupo: 'CAPITAL' as const, saldoInicial: 0,
    }]
    const movs: Movimiento[] = [
      ...MOVIMIENTOS,
      { fecha: '2026-09-11', descripcion: 'Herencia recibida', monto: 300_000, debe: 1, haber: 40, origen: 'manual', conciliado: false },
    ]
    const b = articular(cuentas, movs, '2026-09', TASAS)
    expect(b.aportes).toBe(300_000)
    expect(b.resultado).toBe(126_110)  // una herencia no es ingreso del mes
    expect(b.cuadra).toBe(true)
  })
})

describe('el efecto cambiario se muestra, no se esconde', () => {
  it('un asiento hecho a otra tasa deja una diferencia igual a ese efecto', () => {
    // Los 500 USD se compraron a 60, pero el estado reporta a 63.
    const aOtraTasa = MOVIMIENTOS.map((m) =>
      m.descripcion === 'Aporte al corretaje' ? { ...m, montoHaber: 30_000 } : m,
    )
    const a = articular(CUENTAS, aOtraTasa, '2026-09', TASAS)
    expect(a.diferencia).toBe(1_500)   // 500 USD × (63 − 60)
    expect(a.cuadra).toBe(false)       // no es un error, pero no pasa en silencio
  })
})

describe('revisión del libro', () => {
  it('no encuentra nada en un libro sano', () => {
    expect(revisarLibro(MOVIMIENTOS, CUENTAS)).toEqual([])
  })

  it('encuentra asientos rotos antes de que lleguen a un estado', () => {
    const rotos: Movimiento[] = [
      { id: 1, fecha: '2026-09-01', descripcion: 'A cuenta que no existe', monto: 100, debe: 777, haber: 1, origen: 'manual', conciliado: false },
      { id: 2, fecha: '2026-09-02', descripcion: 'Contra sí misma', monto: 100, debe: 1, haber: 1, origen: 'manual', conciliado: false },
      { id: 3, fecha: '2026-09-03', descripcion: 'Monto negativo', monto: -100, debe: 1, haber: 20, origen: 'manual', conciliado: false },
    ]
    const problemas = revisarLibro(rotos, CUENTAS)
    expect(problemas).toHaveLength(3)
    expect(problemas.map((p) => p.movimientoId)).toEqual([1, 2, 3])
  })
})

describe('la ecuación patrimonial se sostiene sola', () => {
  it('activos = pasivos + patrimonio, en cualquier fecha', () => {
    for (const fecha of ['2026-08-31', '2026-09-15', '2026-09-30', '2026-12-31']) {
      const e = estadoSituacion(CUENTAS, MOVIMIENTOS, fecha, TASAS)
      expect(e.totalActivos).toBe(e.totalPasivos + e.patrimonio)
    }
  })
})
