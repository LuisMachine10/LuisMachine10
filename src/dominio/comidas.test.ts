import { describe, expect, it } from 'vitest'
import { ALIMENTOS } from '../datos/seed/alimentos'
import { MENUS } from '../datos/seed/menus'
import { buscarAlimentos, comidaPorHora, macrosDelDia, macrosParaRegistro } from './comidas'
import { aMinutos } from './horario'
import { PERFIL_INICIAL, calcularMetas } from './metas'
import type { Alimento, Comida } from './tipos'

const mapa = new Map<number, Alimento>(ALIMENTOS.map((a) => [a.id, a]))
const menu = (tipoDia: string, tipo: string) => MENUS.find((m) => m.tipoDia === tipoDia && m.tipo === tipo)!

describe('la comida que toca según la hora', () => {
  it('no te hace elegirla casi nunca', () => {
    expect(comidaPorHora(aMinutos('07:00'))).toBe('desayuno')
    expect(comidaPorHora(aMinutos('12:30'))).toBe('almuerzo')
    expect(comidaPorHora(aMinutos('17:20'))).toBe('merienda')
    expect(comidaPorHora(aMinutos('21:15'))).toBe('cena')
  })
})

describe('búsqueda de alimentos', () => {
  it('pone los favoritos arriba', () => {
    const r = buscarAlimentos(ALIMENTOS, '')
    expect(r.slice(0, 12).every((a) => a.favorito)).toBe(true)
  })

  it('encuentra sin tildes ni mayúsculas', () => {
    expect(buscarAlimentos(ALIMENTOS, 'PLATANO')).toHaveLength(0)
    expect(buscarAlimentos(ALIMENTOS, 'proteina')[0].nombre).toBe('Proteína whey')
    expect(buscarAlimentos(ALIMENTOS, 'salmon')[0].nombre).toBe('Salmón')
  })

  it('busca por trozo del nombre', () => {
    expect(buscarAlimentos(ALIMENTOS, 'arroz').map((a) => a.nombre))
      .toEqual(['Arroz blanco', 'Arroz integral'])
  })
})

describe('un menú modelo cargado de una vez', () => {
  it('el desayuno de día entreno son 5 alimentos con sus gramos', () => {
    const d = menu('ENTRENO', 'desayuno')
    expect(d.items).toHaveLength(5)
    expect(d.items.every((i) => i.gramos > 0)).toBe(true)
  })

  it('el día entreno completo pasa la meta de proteína', () => {
    const comidas: Comida[] = MENUS.filter((m) => m.tipoDia === 'ENTRENO')
      .map((m, i) => ({ id: i, fecha: '2026-09-07', tipo: m.tipo, items: m.items }))
    const total = macrosDelDia(comidas, mapa)
    expect(total.proteinaG).toBeGreaterThanOrEqual(calcularMetas(PERFIL_INICIAL).proteinaG)
  })
})

describe('los macros del registro salen de las comidas', () => {
  const comidaVacia: Comida = { fecha: '2026-09-07', tipo: 'desayuno', items: [] }

  it('sin comidas registradas devuelve null: los campos manuales siguen mandando', () => {
    expect(macrosParaRegistro([], mapa)).toBeNull()
    expect(macrosParaRegistro([comidaVacia], mapa)).toBeNull()
  })

  it('con comidas registradas devuelve los cuatro macros redondeados', () => {
    const d = menu('ENTRENO', 'desayuno')
    const m = macrosParaRegistro([{ fecha: '2026-09-07', tipo: 'desayuno', items: d.items }], mapa)!
    expect(Number.isInteger(m.kcal)).toBe(true)
    expect(Number.isInteger(m.proteinaG)).toBe(true)
    expect(m.kcal).toBeGreaterThan(700)
    expect(m.proteinaG).toBeGreaterThan(45)
  })

  it('250 g de pollo pesados una vez producen los cuatro macros', () => {
    const pollo = ALIMENTOS.find((a) => a.nombre === 'Pechuga de pollo')!
    const m = macrosParaRegistro(
      [{ fecha: '2026-09-07', tipo: 'almuerzo', items: [{ alimentoId: pollo.id, gramos: 250 }] }],
      mapa,
    )!
    expect(m).toEqual({ kcal: 300, proteinaG: 56, carbG: 0, grasaG: 7 })
  })
})
