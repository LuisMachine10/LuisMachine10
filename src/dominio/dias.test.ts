import { describe, expect, it } from 'vitest'
import { aISO, diaSemana, diaSplit, hoyISO, semanaDeReferencia, semanaDelPlan, sumarDias, tipoDiaPorDefecto } from './dias'

describe('calendario', () => {
  it('no desplaza el día por zona horaria (RD = UTC−4)', () => {
    const medianoche = new Date(2026, 8, 7, 0, 5)
    const casiMedianoche = new Date(2026, 8, 7, 23, 55)
    expect(aISO(medianoche)).toBe('2026-09-07')
    expect(aISO(casiMedianoche)).toBe('2026-09-07')
    expect(hoyISO(casiMedianoche)).toBe('2026-09-07')
  })

  it('numera los días 1 = lunes … 7 = domingo', () => {
    expect(diaSemana('2026-09-07')).toBe(1)
    expect(diaSemana('2026-09-11')).toBe(5)
    expect(diaSemana('2026-09-13')).toBe(7)
  })

  it('§4.4 — Lu-Ju ENTRENO, Vi AYUNO, Sá-Do LIGERO', () => {
    const semana = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13']
    expect(semana.map(tipoDiaPorDefecto)).toEqual([
      'ENTRENO', 'ENTRENO', 'ENTRENO', 'ENTRENO', 'AYUNO', 'LIGERO', 'LIGERO',
    ])
  })

  it('§4.5 — solo hay pesas de lunes a jueves', () => {
    expect(diaSplit('2026-09-07')).toBe(1)
    expect(diaSplit('2026-09-10')).toBe(4)
    expect(diaSplit('2026-09-11')).toBeNull()
    expect(diaSplit('2026-09-13')).toBeNull()
  })

  it('cruza el cambio de mes sin perder días', () => {
    expect(sumarDias('2026-09-30', 1)).toBe('2026-10-01')
    expect(sumarDias('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('cuenta las 12 semanas del plan desde el arranque', () => {
    expect(semanaDelPlan('2026-09-07', '2026-09-07')).toBe(1)
    expect(semanaDelPlan('2026-09-13', '2026-09-07')).toBe(1)
    expect(semanaDelPlan('2026-09-14', '2026-09-07')).toBe(2)
    expect(semanaDelPlan('2026-11-29', '2026-09-07')).toBe(12)
    expect(semanaDelPlan('2026-11-30', '2026-09-07')).toBeNull()
    expect(semanaDelPlan('2026-09-06', '2026-09-07')).toBeNull()
  })
})

describe('semana de referencia para precargar cargas', () => {
  it('dentro del ciclo devuelve la semana real', () => {
    expect(semanaDeReferencia('2026-09-07', '2026-09-07')).toEqual({ semana: 1, dentroDelCiclo: true })
    expect(semanaDeReferencia('2026-10-05', '2026-09-07')).toEqual({ semana: 5, dentroDelCiclo: true })
  })

  it('antes de arrancar precarga la semana 1, no deja la barra sin número', () => {
    expect(semanaDeReferencia('2026-09-06', '2026-09-07')).toEqual({ semana: 1, dentroDelCiclo: false })
    expect(semanaDeReferencia('2026-08-01', '2026-09-07')).toEqual({ semana: 1, dentroDelCiclo: false })
  })

  it('pasado el ciclo se queda en la semana 12 como referencia', () => {
    expect(semanaDeReferencia('2026-12-25', '2026-09-07')).toEqual({ semana: 12, dentroDelCiclo: false })
  })
})
