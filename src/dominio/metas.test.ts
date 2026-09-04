import { describe, expect, it } from 'vitest'
import { PERFIL_INICIAL, calcularMetas, metaDelDia } from './metas'

describe('panel de cálculo nutricional (hoja NUTRICION)', () => {
  const m = calcularMetas(PERFIL_INICIAL)

  it('reproduce exacto los valores de referencia del Excel', () => {
    expect(m.tmb).toBe(2018)
    expect(m.tdee).toBe(3128)
    expect(m.kcalEntreno).toBe(2750)
    expect(m.kcalLigero).toBe(2450)
    expect(m.kcalAyuno).toBe(0)
    expect(m.proteinaG).toBe(189)
    expect(m.grasaG).toBe(70)
    expect(m.carbsEntrenoG).toBe(341)
  })

  it('deja los carbohidratos del día ligero en 266 g', () => {
    expect(m.carbsLigeroG).toBe(266)
  })

  it('convierte 220 lb a 99.8 kg y deja 78.8 kg de masa magra', () => {
    expect(m.pesoKg).toBeCloseTo(99.79, 2)
    expect(m.masaMagraKg).toBeCloseTo(78.835, 3)
  })

  it('las kcal siempre caen en múltiplos de 50', () => {
    for (let lb = 180; lb <= 260; lb += 1) {
      const x = calcularMetas({ ...PERFIL_INICIAL, pesoLb: lb })
      expect(x.kcalEntreno % 50).toBe(0)
      expect(x.kcalLigero % 50).toBe(0)
    }
  })

  it('al bajar de peso bajan la meta de kcal, de proteína y de grasa', () => {
    const menos = calcularMetas({ ...PERFIL_INICIAL, pesoLb: 200 })
    expect(menos.kcalEntreno).toBeLessThan(m.kcalEntreno)
    expect(menos.proteinaG).toBeLessThan(m.proteinaG)
    expect(menos.grasaG).toBeLessThan(m.grasaG)
  })

  it('cuadra la ecuación de macros: prot×4 + grasa×9 + carbs×4 ≈ kcal del día', () => {
    const kcal = m.proteinaG * 4 + m.grasaG * 9 + m.carbsEntrenoG * 4
    expect(Math.abs(kcal - m.kcalEntreno)).toBeLessThanOrEqual(2)
  })

  it('la meta del día de ayuno es cero, no la del día ligero', () => {
    expect(metaDelDia(PERFIL_INICIAL, 'AYUNO').kcal).toBe(0)
    expect(metaDelDia(PERFIL_INICIAL, 'LIGERO').kcal).toBe(2450)
    expect(metaDelDia(PERFIL_INICIAL, 'ENTRENO').kcal).toBe(2750)
  })
})
