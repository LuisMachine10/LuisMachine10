import type { Alimento, ItemComida } from './tipos'

export interface Macros {
  kcal: number
  proteinaG: number
  carbG: number
  grasaG: number
}

export const MACROS_CERO: Macros = { kcal: 0, proteinaG: 0, carbG: 0, grasaG: 0 }

/** §4.2 — un solo dato (los gramos) produce los cuatro macros. */
export function macrosDeItem(alimento: Alimento, gramos: number): Macros {
  const f = gramos / 100
  return {
    kcal: alimento.kcal100g * f,
    proteinaG: alimento.prot100g * f,
    carbG: alimento.carb100g * f,
    grasaG: alimento.grasa100g * f,
  }
}

export function sumarMacros(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    proteinaG: a.proteinaG + b.proteinaG,
    carbG: a.carbG + b.carbG,
    grasaG: a.grasaG + b.grasaG,
  }
}

export function macrosDeItems(items: ItemComida[], alimentos: Map<number, Alimento>): Macros {
  return items.reduce((acc, item) => {
    const a = alimentos.get(item.alimentoId)
    return a ? sumarMacros(acc, macrosDeItem(a, item.gramos)) : acc
  }, MACROS_CERO)
}

/** El error que arruina el conteo: pesar cocido lo que se pesa crudo o seco. */
export function avisoDePesaje(alimento: Alimento): string | null {
  if (alimento.estado === 'crudo') return 'Pésalo CRUDO'
  if (alimento.estado === 'seco') return 'Pésalo SECO'
  if (alimento.estado === 'cocidas') return 'Este sí se pesa COCIDO'
  return null
}
