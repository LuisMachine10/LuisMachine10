import { describe, expect, it } from 'vitest'
import { EJERCICIOS } from '../datos/seed/ejercicios'
import { PROHIBIDOS, revisarRestriccion } from './restricciones'

describe('§4.6 — restricciones médicas (hernias discales + meniscos)', () => {
  it('detecta los nueve movimientos prohibidos escritos tal cual', () => {
    for (const p of PROHIBIDOS) {
      expect(revisarRestriccion(p.patron)?.nombre).toBe(p.nombre)
    }
    expect(PROHIBIDOS).toHaveLength(9)
  })

  it('no depende de mayúsculas, tildes ni espacios de más', () => {
    expect(revisarRestriccion('  SENTADILLA CON BARRA  ')?.nombre).toBe('Sentadilla con barra')
    expect(revisarRestriccion('Leñador en polea')?.nombre).toBe('Leñador en polea')
    expect(revisarRestriccion('Saltos al cajón')?.nombre).toBe('Saltos al cajón')
    expect(revisarRestriccion('pliometría')?.nombre).toBe('Pliometría')
  })

  it('avisa mientras se escribe, no solo al terminar', () => {
    expect(revisarRestriccion('sentadilla')?.nombre).toBe('Sentadilla con barra')
    expect(revisarRestriccion('peso muerto convencional con barra')?.nombre).toBe('Peso muerto convencional')
  })

  it('nunca bloquea en silencio: siempre trae motivo y alternativa', () => {
    for (const p of PROHIBIDOS) {
      expect(p.motivo.length).toBeGreaterThan(10)
      expect(p.alternativa.length).toBeGreaterThan(10)
    }
  })

  it('deja pasar lo que sí está permitido', () => {
    for (const permitido of ['prensa de piernas', 'empuje de cadera', 'press pallof', 'dead bug', 'remo en máquina con pecho apoyado', '']) {
      expect(revisarRestriccion(permitido)).toBeNull()
    }
  })

  it('el split sembrado no contiene ningún movimiento prohibido', () => {
    for (const e of EJERCICIOS) {
      expect(revisarRestriccion(e.nombre)).toBeNull()
    }
  })
})

describe('split sembrado desde la hoja GYM', () => {
  it('tiene los cuatro días y ningún día vacío', () => {
    for (const dia of [1, 2, 3, 4]) {
      expect(EJERCICIOS.filter((e) => e.dia === dia).length).toBeGreaterThan(5)
    }
  })

  it('marca los levantamientos ancla que la propia hoja declara', () => {
    const anclas = EJERCICIOS.filter((e) => e.esAncla).map((e) => e.nombre)
    expect(anclas).toHaveLength(5)
    expect(anclas.some((n) => n.includes('Press de banca'))).toBe(true)
    expect(anclas.some((n) => n.includes('Prensa de piernas'))).toBe(true)
    expect(anclas.some((n) => n.includes('Press militar'))).toBe(true)
  })

  it('el RDL queda marcado como CONDICIONAL', () => {
    const rdl = EJERCICIOS.find((e) => e.claveProgresion === 'rdlHex')!
    expect(rdl.restriccion).toContain('CONDICIONAL')
  })
})
