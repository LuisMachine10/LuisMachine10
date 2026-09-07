import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, sembrar } from './db'
import { agregarItem, cargarMenu, quitarItem } from './comidas'
import { alternarToggle, fijarVasos, guardarRegistro } from './registros'
import { guardarSerie, ultimoPeso } from './sesiones'
import { PERFIL_SUGERIDO } from '../dominio/metas'
import { calcularPuntaje } from '../dominio/puntaje'

const LUNES = '2026-09-07'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await sembrar()
})

describe('registrar comidas alimenta el puntaje del día', () => {
  it('cargar los cuatro menús del día entreno deja proteína y calorías en meta', async () => {
    const menus = await db.menus.where('tipoDia').equals('ENTRENO').toArray()
    for (const m of menus) await cargarMenu(LUNES, m.tipo, m.id)

    const r = (await db.registros.get(LUNES))!
    expect(r.proteinaG).toBeGreaterThanOrEqual(189)
    expect(r.kcal).toBeGreaterThan(2000)

    const renglones = calcularPuntaje(r, PERFIL_SUGERIDO).renglones
    expect(renglones.find((x) => x.clave === 'proteina')!.cumplido).toBe(true)
  })

  it('quitar el último alimento devuelve los macros a vacío, no a cero', async () => {
    const pollo = (await db.alimentos.where('nombre').equals('Pechuga de pollo').first())!
    await agregarItem(LUNES, 'almuerzo', { alimentoId: pollo.id, gramos: 250 })
    expect((await db.registros.get(LUNES))!.kcal).toBe(300)

    await quitarItem(LUNES, 'almuerzo', pollo.id)
    expect((await db.registros.get(LUNES))!.kcal).toBeNull()
  })

  it('agregar dos veces el mismo alimento suma los gramos', async () => {
    const pollo = (await db.alimentos.where('nombre').equals('Pechuga de pollo').first())!
    await agregarItem(LUNES, 'almuerzo', { alimentoId: pollo.id, gramos: 100 })
    await agregarItem(LUNES, 'almuerzo', { alimentoId: pollo.id, gramos: 150 })
    const comida = (await db.comidas.where('fecha').equals(LUNES).first())!
    expect(comida.items).toHaveLength(1)
    expect(comida.items[0].gramos).toBe(250)
  })
})

describe('registrar la sesión marca el entrenamiento', () => {
  it('cerrar la primera serie enciende el hábito de 15 puntos', async () => {
    expect((await db.registros.get(LUNES))?.entrenamiento).toBeUndefined()
    await guardarSerie(LUNES, 1, {
      ejercicioId: 2, setNum: 1, pesoLb: 215, reps: 6, rpe: 8, completada: true,
    })
    expect((await db.registros.get(LUNES))!.entrenamiento).toBe(true)
  })

  it('una serie sin cerrar todavía no lo marca', async () => {
    await guardarSerie(LUNES, 1, {
      ejercicioId: 2, setNum: 1, pesoLb: 215, reps: null, rpe: null, completada: false,
    })
    expect((await db.registros.get(LUNES))?.entrenamiento ?? false).toBe(false)
  })

  it('regrabar la misma serie la reemplaza, no la duplica', async () => {
    for (const reps of [5, 6]) {
      await guardarSerie(LUNES, 1, {
        ejercicioId: 2, setNum: 1, pesoLb: 215, reps, rpe: 8, completada: true,
      })
    }
    const s = (await db.sesiones.where('fecha').equals(LUNES).first())!
    expect(s.series).toHaveLength(1)
    expect(s.series[0].reps).toBe(6)
  })

  it('recuerda el último peso levantado de un ejercicio', async () => {
    await guardarSerie('2026-09-07', 1, {
      ejercicioId: 2, setNum: 1, pesoLb: 215, reps: 6, rpe: 8, completada: true,
    })
    await guardarSerie('2026-09-14', 1, {
      ejercicioId: 2, setNum: 1, pesoLb: 225, reps: 5, rpe: 8, completada: true,
    })
    expect(await ultimoPeso(2, '2026-09-21')).toBe(225)
    expect(await ultimoPeso(2, '2026-09-14')).toBe(215)
    expect(await ultimoPeso(999, '2026-09-21')).toBeNull()
  })
})

describe('un día completo de punta a punta', () => {
  it('hábitos + comidas + sesión + agua dan 100 y sobreviven a reabrir la base', async () => {
    for (const t of ['levantar5am', 'camaBulto', 'briefing', 'cardio', 'rosario', 'lectura', 'suplementos'] as const) {
      await alternarToggle(LUNES, t)
    }
    await guardarSerie(LUNES, 1, {
      ejercicioId: 2, setNum: 1, pesoLb: 215, reps: 6, rpe: 8, completada: true,
    })
    const menus = await db.menus.where('tipoDia').equals('ENTRENO').toArray()
    for (const m of menus) await cargarMenu(LUNES, m.tipo, m.id)
    await fijarVasos(LUNES, 8)
    await guardarRegistro(LUNES, { estudioMin: 120, suenoH: 7 })

    await db.close()
    await db.open()

    const r = (await db.registros.get(LUNES))!
    const p = calcularPuntaje(r, PERFIL_SUGERIDO)
    const fallidos = p.renglones.filter((x) => !x.cumplido).map((x) => `${x.etiqueta}: ${x.detalle}`)
    expect(fallidos).toEqual([])
    expect(p.puntaje).toBe(100)
  })
})
