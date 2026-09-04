import { db } from './db'
import { tipoDiaPorDefecto } from '../dominio/dias'
import { registroVacio } from '../dominio/puntaje'
import type { ClaveToggle } from '../dominio/puntaje'
import type { FechaISO, Peso, RegistroDiario, TipoDia } from '../dominio/tipos'

/** El vaso de la app: 8 vasos de 625 ml = los 5 L de la meta. */
export const VASO_L = 0.625
export const VASOS_META = 8

/**
 * Lee y escribe dentro de una misma transacción. Sin esto, dos campos
 * editados casi al mismo tiempo leen el mismo estado viejo y el segundo
 * borra lo que guardó el primero.
 */
export async function guardarRegistro(fecha: FechaISO, parche: Partial<RegistroDiario>): Promise<void> {
  await db.transaction('rw', db.registros, async () => {
    const actual = (await db.registros.get(fecha)) ?? registroVacio(fecha, tipoDiaPorDefecto(fecha))
    await db.registros.put({ ...actual, ...parche, fecha, actualizadoEn: Date.now() })
  })
}

export async function alternarToggle(fecha: FechaISO, clave: ClaveToggle): Promise<void> {
  await db.transaction('rw', db.registros, async () => {
    const actual = (await db.registros.get(fecha)) ?? registroVacio(fecha, tipoDiaPorDefecto(fecha))
    await db.registros.put({
      ...actual,
      [clave]: !actual[clave],
      fecha,
      actualizadoEn: Date.now(),
    })
  })
}

export async function cambiarTipoDia(fecha: FechaISO, tipoDia: TipoDia): Promise<void> {
  await guardarRegistro(fecha, { tipoDia })
}

export async function fijarVasos(fecha: FechaISO, vasos: number): Promise<void> {
  const n = Math.max(0, Math.min(VASOS_META * 2, vasos))
  await guardarRegistro(fecha, { aguaL: n === 0 ? null : Number((n * VASO_L).toFixed(3)) })
}

export function vasosDesdeLitros(litros: number | null): number {
  if (!litros) return 0
  return Math.round(litros / VASO_L)
}

export async function guardarPeso(p: Peso): Promise<void> {
  await db.pesos.put(p)
}

export async function borrarPeso(fecha: FechaISO): Promise<void> {
  await db.pesos.delete(fecha)
}

/** Rango inclusivo de fechas, ordenado. */
export async function registrosEntre(desde: FechaISO, hasta: FechaISO): Promise<RegistroDiario[]> {
  return db.registros.where('fecha').between(desde, hasta, true, true).sortBy('fecha')
}
