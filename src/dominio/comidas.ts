import { MACROS_CERO, macrosDeItems, sumarMacros } from './macros'
import type { Macros } from './macros'
import type { Alimento, Comida, TipoComida } from './tipos'

export const TIPOS_COMIDA: TipoComida[] = ['desayuno', 'almuerzo', 'merienda', 'cena']

export const ETIQUETA_COMIDA: Record<TipoComida, string> = {
  desayuno: 'Desayuno',
  almuerzo: 'Almuerzo',
  merienda: 'Merienda',
  cena: 'Cena',
}

/** La comida que toca según la hora, para no tener que elegirla casi nunca. */
export function comidaPorHora(minutos: number): TipoComida {
  if (minutos < 10 * 60 + 30) return 'desayuno'
  if (minutos < 15 * 60) return 'almuerzo'
  if (minutos < 18 * 60 + 30) return 'merienda'
  return 'cena'
}

export function macrosDeComida(comida: Comida, alimentos: Map<number, Alimento>): Macros {
  return macrosDeItems(comida.items, alimentos)
}

export function macrosDelDia(comidas: Comida[], alimentos: Map<number, Alimento>): Macros {
  return comidas.reduce((acc, c) => sumarMacros(acc, macrosDeComida(c, alimentos)), MACROS_CERO)
}

/**
 * Un solo dato, una sola vez: si el día tiene comidas registradas, los macros
 * del RegistroDiario salen de ahí y dejan de escribirse a mano.
 */
export function macrosParaRegistro(comidas: Comida[], alimentos: Map<number, Alimento>) {
  const conItems = comidas.filter((c) => c.items.length > 0)
  if (conItems.length === 0) return null
  const m = macrosDelDia(conItems, alimentos)
  return {
    kcal: Math.round(m.kcal),
    proteinaG: Math.round(m.proteinaG),
    carbG: Math.round(m.carbG),
    grasaG: Math.round(m.grasaG),
  }
}

/** Búsqueda sin tildes ni mayúsculas: escribes "platano" y aparece "plátano". */
export function normalizarTexto(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

export function buscarAlimentos(alimentos: Alimento[], consulta: string): Alimento[] {
  const q = normalizarTexto(consulta)
  const orden = (a: Alimento, b: Alimento) =>
    Number(b.favorito) - Number(a.favorito) || a.nombre.localeCompare(b.nombre, 'es')
  if (!q) return [...alimentos].sort(orden)
  return alimentos.filter((a) => normalizarTexto(a.nombre).includes(q)).sort(orden)
}
