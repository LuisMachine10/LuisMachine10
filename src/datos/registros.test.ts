import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, exportarRespaldo, importarRespaldo, sembrar } from './db'
import { alternarToggle, fijarVasos, guardarPeso, guardarRegistro, registrosEntre, vasosDesdeLitros } from './registros'
import { PERFIL_INICIAL } from '../dominio/metas'
import { calcularPuntaje } from '../dominio/puntaje'

const FECHA = '2026-09-07'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await sembrar()
})

describe('siembra desde el Excel', () => {
  it('deja los catálogos completos y el perfil de arranque', async () => {
    expect(await db.alimentos.count()).toBe(44)
    expect(await db.ejercicios.count()).toBe(46)
    expect(await db.progresion.count()).toBe(12)
    expect(await db.menus.count()).toBe(9)
    expect((await db.perfil.get('perfil'))!.pesoLb).toBe(220)
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
    expect(calcularPuntaje(r, PERFIL_INICIAL).puntaje).toBe(51)
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
    expect(calcularPuntaje(r, PERFIL_INICIAL).puntaje).toBe(100)
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
    expect(r).toEqual({ registros: 1, pesos: 1 })
    expect((await db.registros.get(FECHA))!.proteinaG).toBe(195)
    expect((await db.pesos.get('2026-09-05'))!.pesoLb).toBe(220)
  })

  it('rechaza un archivo que no es un respaldo de la app', async () => {
    await expect(importarRespaldo({ app: 'otra-cosa' })).rejects.toThrow('Sistema Mena')
  })
})
