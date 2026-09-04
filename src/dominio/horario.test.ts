import { describe, expect, it } from 'vitest'
import { HORARIO } from '../datos/seed/horario'
import { aMinutos, siguienteBloque } from './horario'

describe('horario semanal sembrado desde el Excel', () => {
  it('cubre los siete días', () => {
    for (let d = 1; d <= 7; d++) {
      expect(HORARIO.filter((b) => b.dia === d).length).toBeGreaterThan(5)
    }
  })

  it('todos los bloques tienen hora válida', () => {
    for (const b of HORARIO) {
      expect(b.hora).toMatch(/^\d{2}:\d{2}$/)
      expect(aMinutos(b.hora)).toBeGreaterThanOrEqual(0)
      expect(aMinutos(b.hora)).toBeLessThan(24 * 60)
    }
  })

  it('el miércoles a las 17:00 lo próximo es el softball del Centro Español', () => {
    const miercoles = HORARIO.filter((b) => b.dia === 3)
    const b = siguienteBloque(miercoles, aMinutos('17:00'))
    expect(b?.hora).toBe('17:30')
    expect(b?.actividad).toContain('SOFTBALL')
  })

  it('el lunes a las 4:00 lo próximo es despertar a las 5:00', () => {
    const b = siguienteBloque(HORARIO.filter((x) => x.dia === 1), aMinutos('04:00'))
    expect(b?.hora).toBe('05:00')
  })

  it('pasada la última hora del día no inventa un bloque', () => {
    expect(siguienteBloque(HORARIO.filter((b) => b.dia === 1), aMinutos('23:59'))).toBeNull()
  })
})
