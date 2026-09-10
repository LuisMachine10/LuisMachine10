import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { crearCuenta, guardarPresupuesto, registrarMovimiento } from './capital'
import { db, exportarRespaldo, importarRespaldo, sembrar } from './db'
import { alternarToggle, fijarVasos, guardarPeso, guardarRegistro, registrosEntre, vasosDesdeLitros } from './registros'
import { PERFIL_SUGERIDO } from '../dominio/metas'
import { calcularPuntaje } from '../dominio/puntaje'

const FECHA = '2026-09-07'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await sembrar()
})

describe('siembra desde el Excel', () => {
  it('deja los catálogos completos', () => {
    return Promise.all([
      db.alimentos.count().then((n) => expect(n).toBe(44)),
      db.ejercicios.count().then((n) => expect(n).toBe(46)),
      db.progresion.count().then((n) => expect(n).toBe(12)),
      db.menus.count().then((n) => expect(n).toBe(9)),
    ])
  })

  it('pero NO inventa tus datos: el perfil arranca en blanco', async () => {
    const p = (await db.perfil.get('perfil'))!
    expect(p.pesoLb).toBe(0)
    expect(p.nombre).toBe('')
    expect(p.completado).toBe(false)
  })

  it('sembrar dos veces no duplica nada', async () => {
    await sembrar()
    expect(await db.alimentos.count()).toBe(44)
  })
})

describe('registro diario', () => {
  it('dos campos guardados casi a la vez no se pisan entre sí', async () => {
    await Promise.all([
      guardarRegistro(FECHA, { proteinaG: 195 }),
      guardarRegistro(FECHA, { kcal: 2760 }),
      guardarRegistro(FECHA, { estudioMin: 120 }),
      guardarRegistro(FECHA, { suenoH: 7 }),
    ])
    const r = (await db.registros.get(FECHA))!
    expect(r.proteinaG).toBe(195)
    expect(r.kcal).toBe(2760)
    expect(r.estudioMin).toBe(120)
    expect(r.suenoH).toBe(7)
  })

  it('ocho toques seguidos encienden los ocho hábitos', async () => {
    await Promise.all([
      alternarToggle(FECHA, 'levantar5am'),
      alternarToggle(FECHA, 'camaBulto'),
      alternarToggle(FECHA, 'briefing'),
      alternarToggle(FECHA, 'entrenamiento'),
      alternarToggle(FECHA, 'cardio'),
      alternarToggle(FECHA, 'rosario'),
      alternarToggle(FECHA, 'lectura'),
      alternarToggle(FECHA, 'suplementos'),
    ])
    const r = (await db.registros.get(FECHA))!
    expect(calcularPuntaje(r, PERFIL_SUGERIDO).puntaje).toBe(51)
  })

  it('un día completo registrado da 100 y sobrevive a releer la base', async () => {
    for (const t of ['levantar5am', 'camaBulto', 'briefing', 'entrenamiento', 'cardio', 'rosario', 'lectura', 'suplementos'] as const) {
      await alternarToggle(FECHA, t)
    }
    await fijarVasos(FECHA, 8)
    await guardarRegistro(FECHA, { proteinaG: 195, kcal: 2760, estudioMin: 120, suenoH: 7 })

    await db.close()
    await db.open()
    const r = (await db.registros.get(FECHA))!
    expect(calcularPuntaje(r, PERFIL_SUGERIDO).puntaje).toBe(100)
  })

  it('el contador de agua traduce vasos a litros y de vuelta', async () => {
    await fijarVasos(FECHA, 8)
    expect((await db.registros.get(FECHA))!.aguaL).toBe(5)
    expect(vasosDesdeLitros(5)).toBe(8)
    await fijarVasos(FECHA, 0)
    expect((await db.registros.get(FECHA))!.aguaL).toBeNull()
  })

  it('alternar dos veces deja el hábito apagado', async () => {
    await alternarToggle(FECHA, 'rosario')
    await alternarToggle(FECHA, 'rosario')
    expect((await db.registros.get(FECHA))!.rosario).toBe(false)
  })

  it('trae los registros de un rango ordenados', async () => {
    await guardarRegistro('2026-09-09', { rosario: true })
    await guardarRegistro('2026-09-07', { rosario: true })
    await guardarRegistro('2026-09-20', { rosario: true })
    const r = await registrosEntre('2026-09-07', '2026-09-13')
    expect(r.map((x) => x.fecha)).toEqual(['2026-09-07', '2026-09-09'])
  })
})

describe('respaldo JSON', () => {
  it('exporta lo registrado y lo devuelve intacto al importar', async () => {
    await guardarRegistro(FECHA, { proteinaG: 195, kcal: 2760, rosario: true })
    await guardarPeso({ fecha: '2026-09-05', pesoLb: 220, pctGrasa: 0.21, cinturaCm: 96, notas: 'base' })
    const respaldo = await exportarRespaldo()
    expect(respaldo.registros).toHaveLength(1)
    expect(respaldo.pesos).toHaveLength(1)

    await db.registros.clear()
    await db.pesos.clear()
    const r = await importarRespaldo(JSON.parse(JSON.stringify(respaldo)))
    expect(r).toEqual({ registros: 1, pesos: 1, metas: 0, logros: 0, movimientos: 0 })
    expect((await db.registros.get(FECHA))!.proteinaG).toBe(195)
    expect((await db.pesos.get('2026-09-05'))!.pesoLb).toBe(220)
  })

  it('rechaza un archivo que no es un respaldo de la app', async () => {
    await expect(importarRespaldo({ app: 'otra-cosa' })).rejects.toThrow('Sistema Mena')
  })

  it('el libro de Mena Capital también entra al respaldo', async () => {
    // Una tabla que no está en el respaldo hace que el respaldo mienta: se
    // restaura "todo" y las cuentas no vuelven.
    const cuentaId = await crearCuenta(
      { nombre: 'Banco', clase: 'ACTIVO', grupo: 'EFECTIVO', moneda: 'DOP',
        seValuaAMercado: false, ticker: '', activa: true, nota: '' },
      180_000, '2026-08-31',
    )
    const gastoId = await crearCuenta(
      { nombre: 'Vivienda', clase: 'GASTO', grupo: 'GASTO FIJO', moneda: 'DOP',
        seValuaAMercado: false, ticker: '', activa: true, nota: '' },
      0, '2026-08-31',
    )
    await registrarMovimiento({
      fecha: '2026-09-01', descripcion: 'Alquiler', monto: 35_000,
      debe: gastoId, haber: cuentaId, origen: 'manual', conciliado: false,
    })
    await guardarPresupuesto('2026-09', [{ mes: '2026-09', cuentaId: gastoId, monto: 35_000, nota: '' }])

    const respaldo = await exportarRespaldo()
    expect(respaldo.cuentas).toHaveLength(2)
    expect(respaldo.movimientos).toHaveLength(1)
    expect(respaldo.presupuesto).toHaveLength(1)

    await db.cuentas.clear()
    await db.movimientos.clear()
    await db.presupuesto.clear()
    const r = await importarRespaldo(JSON.parse(JSON.stringify(respaldo)))
    expect(r.movimientos).toBe(1)
    expect(await db.cuentas.count()).toBe(2)
    expect((await db.movimientos.get(1))!.monto).toBe(35_000)
    expect((await db.presupuesto.count())).toBe(1)
  })

  it('no deja guardar un asiento roto: la validación vive antes de la base', async () => {
    const banco = await crearCuenta(
      { nombre: 'Banco', clase: 'ACTIVO', grupo: 'EFECTIVO', moneda: 'DOP',
        seValuaAMercado: false, ticker: '', activa: true, nota: '' },
      0, '2026-08-31',
    )
    await expect(registrarMovimiento({
      fecha: '2026-09-01', descripcion: 'Contra sí misma', monto: 100,
      debe: banco, haber: banco, origen: 'manual', conciliado: false,
    })).rejects.toThrow(/sí misma/)
    await expect(registrarMovimiento({
      fecha: '2026-09-01', descripcion: 'Monto cero', monto: 0,
      debe: banco, haber: 999, origen: 'manual', conciliado: false,
    })).rejects.toThrow(/mayor que cero/)
    expect(await db.movimientos.count()).toBe(0)
  })
})
