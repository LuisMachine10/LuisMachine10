import { describe, expect, it } from 'vitest'
import {
  diasDelMes, mesAnterior, mesCorto, mesDe, nombreMes, primerDia, rangoMeses, sumarMeses,
  ultimoDia, ultimosMeses,
} from './meses'

describe('meses', () => {
  it('saca el mes de una fecha sin tocar zonas horarias', () => {
    expect(mesDe('2026-09-07')).toBe('2026-09')
    // El caso que rompe a quien use Date: fin de mes de noche en UTC-4.
    expect(mesDe('2026-01-31')).toBe('2026-01')
  })

  it('suma y resta meses cruzando el año', () => {
    expect(sumarMeses('2026-12', 1)).toBe('2027-01')
    expect(sumarMeses('2026-01', -1)).toBe('2025-12')
    expect(sumarMeses('2026-09', 12)).toBe('2027-09')
    expect(sumarMeses('2026-03', -15)).toBe('2024-12')
    expect(mesAnterior('2026-01')).toBe('2025-12')
  })

  it('conoce el largo de cada mes, incluido febrero bisiesto', () => {
    expect(diasDelMes('2026-02')).toBe(28)
    expect(diasDelMes('2028-02')).toBe(29)
    expect(diasDelMes('2000-02')).toBe(29)
    expect(diasDelMes('1900-02')).toBe(28)
    expect(ultimoDia('2026-09')).toBe('2026-09-30')
    expect(primerDia('2026-09')).toBe('2026-09-01')
  })

  it('arma rangos en orden cronológico', () => {
    expect(rangoMeses('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
    expect(rangoMeses('2026-09', '2026-09')).toEqual(['2026-09'])
    expect(rangoMeses('2026-09', '2026-08')).toEqual([])
    expect(ultimosMeses('2026-03', 3)).toEqual(['2026-01', '2026-02', '2026-03'])
  })

  it('nombra los meses en español', () => {
    expect(nombreMes('2026-09')).toBe('septiembre 2026')
    expect(mesCorto('2026-09')).toBe('sep 26')
  })
})
