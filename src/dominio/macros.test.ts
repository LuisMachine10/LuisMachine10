import { describe, expect, it } from 'vitest'
import { ALIMENTOS } from '../datos/seed/alimentos'
import { MENUS } from '../datos/seed/menus'
import { avisoDePesaje, macrosDeItem, macrosDeItems } from './macros'
import { PERFIL_SUGERIDO, calcularMetas } from './metas'
import type { Alimento } from './tipos'

const porNombre = (n: string) => ALIMENTOS.find((a) => a.nombre === n)!
const mapa = new Map<number, Alimento>(ALIMENTOS.map((a) => [a.id, a]))

describe('tabla de alimentos sembrada desde el Excel', () => {
  it('trae las 44 filas y 12 favoritos', () => {
    expect(ALIMENTOS).toHaveLength(44)
    expect(ALIMENTOS.filter((a) => a.favorito)).toHaveLength(12)
  })

  it('ningún alimento tiene macros negativas ni id repetido', () => {
    expect(new Set(ALIMENTOS.map((a) => a.id)).size).toBe(ALIMENTOS.length)
    for (const a of ALIMENTOS) {
      expect(a.kcal100g).toBeGreaterThanOrEqual(0)
      expect(a.prot100g).toBeGreaterThanOrEqual(0)
      expect(a.carb100g).toBeGreaterThanOrEqual(0)
      expect(a.grasa100g).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('§4.2 — un solo dato (los gramos) produce los cuatro macros', () => {
  it('250 g de pechuga cruda = 300 kcal y 56.25 g de proteína', () => {
    const m = macrosDeItem(porNombre('Pechuga de pollo'), 250)
    expect(m.kcal).toBeCloseTo(300, 6)
    expect(m.proteinaG).toBeCloseTo(56.25, 6)
    expect(m.carbG).toBe(0)
    expect(m.grasaG).toBeCloseTo(6.5, 6)
  })

  it('una cucharada mal medida de aceite son 124 kcal invisibles', () => {
    expect(macrosDeItem(porNombre('Aceite de oliva'), 14).kcal).toBeCloseTo(123.76, 6)
  })

  it('la creatina no aporta calorías: no rompe el ayuno', () => {
    expect(macrosDeItem(porNombre('Creatina monohidratada'), 5).kcal).toBe(0)
  })
})

describe('avisos de pesaje — el error que arruina el conteo', () => {
  it('la carne y el pescado se pesan crudos', () => {
    expect(avisoDePesaje(porNombre('Pechuga de pollo'))).toBe('Pésalo CRUDO')
    expect(avisoDePesaje(porNombre('Tilapia'))).toBe('Pésalo CRUDO')
  })
  it('el arroz y la avena se pesan secos', () => {
    expect(avisoDePesaje(porNombre('Arroz blanco'))).toBe('Pésalo SECO')
    expect(avisoDePesaje(porNombre('Avena en hojuelas'))).toBe('Pésalo SECO')
  })
  it('las lentejas son la excepción: esas sí se pesan cocidas', () => {
    expect(avisoDePesaje(porNombre('Lentejas'))).toBe('Este sí se pesa COCIDO')
  })
})

describe('menús modelo del Excel', () => {
  const totalDia = (tipoDia: string) =>
    MENUS.filter((m) => m.tipoDia === tipoDia).flatMap((m) => m.items)

  it('el día ENTRENO llega a la meta de proteína y queda cerca de las 2,750 kcal', () => {
    const t = macrosDeItems(totalDia('ENTRENO'), mapa)
    const meta = calcularMetas(PERFIL_SUGERIDO)
    expect(t.proteinaG).toBeGreaterThanOrEqual(meta.proteinaG)
    expect(Math.abs(t.kcal - meta.kcalEntreno)).toBeLessThanOrEqual(300)
  })

  it('el día LIGERO baja carbohidratos pero no baja proteína', () => {
    const entreno = macrosDeItems(totalDia('ENTRENO'), mapa)
    const ligero = macrosDeItems(totalDia('LIGERO'), mapa)
    expect(ligero.carbG).toBeLessThan(entreno.carbG)
    expect(ligero.proteinaG).toBeGreaterThanOrEqual(calcularMetas(PERFIL_SUGERIDO).proteinaG)
  })

  it('la cena de ruptura del viernes pasa del techo de 200 kcal del ayuno', () => {
    const t = macrosDeItems(totalDia('AYUNO'), mapa)
    expect(t.kcal).toBeGreaterThan(PERFIL_SUGERIDO.techoKcalAyuno)
  })
})
