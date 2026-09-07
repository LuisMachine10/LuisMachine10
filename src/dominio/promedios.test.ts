import { describe, expect, it } from 'vitest'
import { PERFIL_SUGERIDO } from './metas'
import { estadoDeResultados, mediaMovil, resumirPeriodo } from './promedios'
import { registroVacio } from './puntaje'
import type { RegistroDiario } from './tipos'

const P = PERFIL_SUGERIDO

function dia(fecha: string, parche: Partial<RegistroDiario> = {}): RegistroDiario {
  return { ...registroVacio(fecha, 'ENTRENO'), ...parche }
}

describe('promedios — la métrica es el promedio, no el día suelto', () => {
  it('los días no registrados no ensucian el promedio con ceros falsos', () => {
    const registros = [
      dia('2026-09-07', { levantar5am: true }), // 8
      dia('2026-09-08'),                        // no registrado
      dia('2026-09-09', { entrenamiento: true }), // 15
    ]
    const r = resumirPeriodo(registros, P)
    expect(r.diasRegistrados).toBe(2)
    expect(r.puntajePromedio).toBe(11.5)
  })

  it('sin ningún día registrado devuelve null, no cero', () => {
    expect(resumirPeriodo([dia('2026-09-07')], P).puntajePromedio).toBeNull()
    expect(resumirPeriodo([], P).puntajePromedio).toBeNull()
  })

  it('cuenta días sobre 80 y bajo 60', () => {
    const r = resumirPeriodo(
      [
        dia('2026-09-07', { levantar5am: true, camaBulto: true, briefing: true, entrenamiento: true, cardio: true, rosario: true, lectura: true, suplementos: true, aguaL: 5, estudioMin: 120, suenoH: 7, proteinaG: 200, kcal: 2750 }),
        dia('2026-09-08', { levantar5am: true }),
      ],
      P,
    )
    expect(r.diasSobre80).toBe(1)
    expect(r.diasBajo60).toBe(1)
  })
})

describe('estado de resultados de la disciplina', () => {
  const semana: RegistroDiario[] = [
    dia('2026-09-07', { levantar5am: true, camaBulto: true, briefing: true, entrenamiento: true, rosario: true, aguaL: 5, estudioMin: 120, suenoH: 7 }),
    dia('2026-09-08', { levantar5am: true, camaBulto: true, briefing: true, entrenamiento: true, rosario: true, aguaL: 5, estudioMin: 30, suenoH: 5 }),
  ]

  it('reparte los puntos por renglón como el DASHBOARD', () => {
    const e = estadoDeResultados(semana, P)
    const base = e.categorias.find((c) => c.categoria === 'DISCIPLINA BASE')!
    expect(base.posibles).toBe(36) // 18 por día × 2 días
    expect(base.logrados).toBe(36)
    expect(base.diagnostico).toBe('Sólido')

    const recuperacion = e.categorias.find((c) => c.categoria === 'RECUPERACIÓN')!
    expect(recuperacion.logrados).toBe(6)
    expect(recuperacion.posibles).toBe(12)
    expect(recuperacion.diagnostico).toBe('Aquí se está fugando el resultado')
  })

  it('el margen total es el promedio ponderado, no el promedio de porcentajes', () => {
    const e = estadoDeResultados(semana, P)
    expect(e.posibles).toBe(200)
    expect(e.margen).toBeCloseTo(e.logrados / 200, 10)
  })

  it('con denominador de aplicables, el domingo de descanso no castiga ENTRENAMIENTO', () => {
    const domingo = [dia('2026-09-13', { tipoDia: 'LIGERO', levantar5am: true, rosario: true })]
    const crudo = estadoDeResultados(domingo, P, false)
    const aplicable = estadoDeResultados(domingo, P, true)
    expect(crudo.categorias.find((c) => c.categoria === 'ENTRENAMIENTO')!.posibles).toBe(21)
    expect(aplicable.categorias.find((c) => c.categoria === 'ENTRENAMIENTO')!.posibles).toBe(0)
  })

  it('sin días registrados no inventa diagnósticos', () => {
    const e = estadoDeResultados([], P)
    expect(e.margen).toBeNull()
    expect(e.categorias.every((c) => c.diagnostico === null)).toBe(true)
  })
})

describe('media móvil de 4 registros — la línea gruesa, no el punto suelto', () => {
  it('no calcula nada hasta tener los 4 primeros datos', () => {
    expect(mediaMovil([220, 219, 218, 217])).toEqual([null, null, null, 218.5])
  })

  it('suaviza el ruido de un pesaje raro', () => {
    const serie = mediaMovil([220, 218, 224, 218, 216])
    expect(serie[3]).toBe(220)
    expect(serie[4]).toBe(219)
  })

  it('un hueco en la serie deja la media en null, no la inventa', () => {
    expect(mediaMovil([220, null, 218, 217, 216])[3]).toBeNull()
  })
})
