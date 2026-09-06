import { describe, expect, it } from 'vitest'
import { EJERCICIOS } from '../datos/seed/ejercicios'
import { PROGRESION } from '../datos/seed/progresion'
import { cargaObjetivo, interpretarCarga, librosDeDiscos } from './cargas'

describe('lectura de la hoja PROGRESION', () => {
  it('lee la serie tope de banca con su peso y sus reps', () => {
    expect(interpretarCarga('225 lb x 5')).toMatchObject({ pesoLb: 225, reps: 5 })
    expect(interpretarCarga('245 lb x 4')).toMatchObject({ pesoLb: 245, reps: 4 })
  })

  it('lee las series de descarga "3x8 @ 185"', () => {
    expect(interpretarCarga('3x8 @ 185')).toMatchObject({ series: 3, reps: 8, pesoLb: 185 })
  })

  it('lee la semana de deload con su cantidad de series', () => {
    expect(interpretarCarga('185 lb x 5 (2 series)')).toMatchObject({ pesoLb: 185, reps: 5, series: 2 })
  })

  it('el remo en máquina se mide en discos por lado, no en libras', () => {
    const c = interpretarCarga('5.0 x 10', 'remoMaquina')
    expect(c.discosPorLado).toBe(5)
    expect(c.pesoLb).toBeNull()
    expect(librosDeDiscos(5)).toBe(450)
  })

  it('un número pequeño sin unidad son series, no libras', () => {
    expect(interpretarCarga('5 x 6', 'dominadas')).toMatchObject({ series: 5, reps: 6, pesoLb: null })
    expect(interpretarCarga('3 x 22', 'pechadas')).toMatchObject({ series: 3, reps: 22, pesoLb: null })
  })

  it('la prensa y el empuje de cadera sí son libras', () => {
    expect(interpretarCarga('680 x 6', 'prensaPiernas')).toMatchObject({ pesoLb: 680, reps: 6 })
    expect(interpretarCarga('155 x 10', 'empujeCadera')).toMatchObject({ pesoLb: 155, reps: 10 })
  })

  it('no inventa números cuando la celda es solo texto', () => {
    expect(interpretarCarga('DELOAD + retest')).toMatchObject({ pesoLb: null, reps: null })
    expect(interpretarCarga('—')).toMatchObject({ pesoLb: null, texto: '—' })
    expect(interpretarCarga('')).toMatchObject({ pesoLb: null, texto: '' })
  })
})

describe('carga objetivo por ejercicio y semana', () => {
  const banca = EJERCICIOS.find((e) => e.claveProgresion === 'pressBancaTope')!
  const prensa = EJERCICIOS.find((e) => e.claveProgresion === 'prensaPiernas')!

  it('la banca sube 215 → 225 → 235 en el primer bloque', () => {
    expect(cargaObjetivo(banca, PROGRESION[0])!.pesoLb).toBe(215)
    expect(cargaObjetivo(banca, PROGRESION[1])!.pesoLb).toBe(225)
    expect(cargaObjetivo(banca, PROGRESION[2])!.pesoLb).toBe(235)
  })

  it('la semana 4 es deload: la banca baja a 185', () => {
    expect(cargaObjetivo(banca, PROGRESION[3])!.pesoLb).toBe(185)
  })

  it('la prensa nunca pasa del máximo declarado de 800 lb', () => {
    for (const semana of PROGRESION) {
      const c = cargaObjetivo(prensa, semana)
      if (c?.pesoLb) expect(c.pesoLb).toBeLessThanOrEqual(800)
    }
  })

  it('las 12 semanas dejan una carga legible para cada ejercicio enlazado', () => {
    const enlazados = EJERCICIOS.filter((e) => e.claveProgresion)
    expect(enlazados.length).toBe(7)
    for (const e of enlazados) {
      for (const semana of PROGRESION) {
        expect(cargaObjetivo(e, semana)!.texto.length).toBeGreaterThan(0)
      }
    }
  })

  it('un ejercicio sin columna en PROGRESION no inventa carga', () => {
    const face = EJERCICIOS.find((e) => e.nombre === 'Face pull')!
    expect(cargaObjetivo(face, PROGRESION[0])).toBeNull()
  })
})
