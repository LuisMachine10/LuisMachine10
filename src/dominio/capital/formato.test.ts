import { describe, expect, it } from 'vitest'
import { monto, montoConSigno, montoCorto, montoRD, oRaya, pct, pctConSigno } from './formato'

describe('formato de cifras', () => {
  it('separa los miles y redondea a peso entero', () => {
    expect(monto(1_047_510)).toBe('1,047,510')
    expect(monto(234_700.49)).toBe('234,700')
    expect(montoRD(405_110)).toBe('RD$ 405,110')
  })

  it('muestra centavos solo cuando se piden', () => {
    expect(monto(1_234.5, true)).toBe('1,234.50')
    expect(monto(1_234.5)).toBe('1,235')
  })

  it('en una variación el signo es el dato, y va siempre delante', () => {
    expect(montoConSigno(11_110)).toBe('+11,110')
    expect(montoConSigno(-2_500)).toBe('−2,500')
    expect(montoConSigno(0)).toBe('0')
  })

  it('acorta para ejes de gráfica sin perder la magnitud', () => {
    expect(montoCorto(405_110)).toBe('405K')
    expect(montoCorto(4_620)).toBe('4.6K')
    expect(montoCorto(1_500_000)).toBe('1.5MM')
    expect(montoCorto(-31_500)).toBe('−31.5K')
    expect(montoCorto(750)).toBe('750')
  })

  it('un valor que no existe se muestra como raya, nunca como cero', () => {
    expect(pct(null)).toBe('—')
    expect(pctConSigno(null)).toBe('—')
    expect(oRaya(null, monto)).toBe('—')
    expect(oRaya(0, monto)).toBe('0')
    expect(oRaya(NaN, monto)).toBe('—')
  })

  it('los porcentajes llevan su signo cuando son variación', () => {
    expect(pct(61.19, 2)).toBe('61.19%')
    expect(pctConSigno(45.2)).toBe('+45.2%')
    expect(pctConSigno(-16)).toBe('−16.0%')
  })
})
