import { db } from './db'
import { guardarRegistro } from './registros'
import { macrosParaRegistro } from '../dominio/comidas'
import type { Alimento, Comida, FechaISO, ItemComida, TipoComida } from '../dominio/tipos'

async function recalcularMacrosDelDia(fecha: FechaISO): Promise<void> {
  const [comidas, alimentos] = await Promise.all([
    db.comidas.where('fecha').equals(fecha).toArray(),
    db.alimentos.toArray(),
  ])
  const mapa = new Map<number, Alimento>(alimentos.map((a) => [a.id, a]))
  const macros = macrosParaRegistro(comidas, mapa)
  await guardarRegistro(
    fecha,
    macros ?? { kcal: null, proteinaG: null, carbG: null, grasaG: null },
  )
}

async function comidaDe(fecha: FechaISO, tipo: TipoComida): Promise<Comida> {
  const existente = await db.comidas.where('fecha').equals(fecha).filter((c) => c.tipo === tipo).first()
  return existente ?? { fecha, tipo, items: [] }
}

export async function guardarItems(fecha: FechaISO, tipo: TipoComida, items: ItemComida[]): Promise<void> {
  const comida = await comidaDe(fecha, tipo)
  await db.comidas.put({ ...comida, items })
  await recalcularMacrosDelDia(fecha)
}

export async function agregarItem(fecha: FechaISO, tipo: TipoComida, item: ItemComida): Promise<void> {
  const comida = await comidaDe(fecha, tipo)
  const i = comida.items.findIndex((x) => x.alimentoId === item.alimentoId)
  const items =
    i >= 0
      ? comida.items.map((x, j) => (j === i ? { ...x, gramos: x.gramos + item.gramos } : x))
      : [...comida.items, item]
  await guardarItems(fecha, tipo, items)
}

export async function cambiarGramos(
  fecha: FechaISO, tipo: TipoComida, alimentoId: number, gramos: number,
): Promise<void> {
  const comida = await comidaDe(fecha, tipo)
  await guardarItems(
    fecha, tipo,
    comida.items.map((x) => (x.alimentoId === alimentoId ? { ...x, gramos } : x)),
  )
}

export async function quitarItem(fecha: FechaISO, tipo: TipoComida, alimentoId: number): Promise<void> {
  const comida = await comidaDe(fecha, tipo)
  await guardarItems(fecha, tipo, comida.items.filter((x) => x.alimentoId !== alimentoId))
}

/** Carga un menú modelo completo del Excel: 5 alimentos con sus gramos, un toque. */
export async function cargarMenu(fecha: FechaISO, tipo: TipoComida, menuId: number): Promise<void> {
  const menu = await db.menus.get(menuId)
  if (!menu) return
  await guardarItems(fecha, tipo, menu.items.map((i) => ({ ...i })))
}

export async function alternarFavorito(alimentoId: number): Promise<void> {
  const a = await db.alimentos.get(alimentoId)
  if (a) await db.alimentos.put({ ...a, favorito: !a.favorito })
}
