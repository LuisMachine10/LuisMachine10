import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { registrosEntre } from './registros'
import { sumarDias } from '../dominio/dias'
import { PERFIL_INICIAL } from '../dominio/metas'
import type { FechaISO } from '../dominio/tipos'

export function usarPerfil() {
  return useLiveQuery(async () => (await db.perfil.get('perfil')) ?? PERFIL_INICIAL, [], PERFIL_INICIAL)
}

export function usarRegistro(fecha: FechaISO) {
  return useLiveQuery(() => db.registros.get(fecha), [fecha])
}

export function usarUltimosDias(fecha: FechaISO, dias: number) {
  return useLiveQuery(() => registrosEntre(sumarDias(fecha, -(dias - 1)), fecha), [fecha, dias], [])
}

export function usarPesos() {
  return useLiveQuery(() => db.pesos.orderBy('fecha').toArray(), [], [])
}

export function usarHorarioDelDia(dia: number) {
  return useLiveQuery(() => db.horario.where('dia').equals(dia).sortBy('hora'), [dia], [])
}

export function usarAjuste(clave: string) {
  return useLiveQuery(() => db.ajustes.get(clave), [clave])
}

export function usarAlimentos() {
  return useLiveQuery(() => db.alimentos.toArray(), [], [])
}

export function usarComidasDelDia(fecha: FechaISO) {
  return useLiveQuery(() => db.comidas.where('fecha').equals(fecha).toArray(), [fecha], [])
}

export function usarMenus() {
  return useLiveQuery(() => db.menus.toArray(), [], [])
}

export function usarEjercicios(dia: number) {
  return useLiveQuery(() => db.ejercicios.where('dia').equals(dia).sortBy('orden'), [dia], [])
}

export function usarProgresion() {
  return useLiveQuery(() => db.progresion.orderBy('semana').toArray(), [], [])
}

export function usarSesion(fecha: FechaISO) {
  return useLiveQuery(() => db.sesiones.where('fecha').equals(fecha).first(), [fecha])
}

export function usarSesiones() {
  return useLiveQuery(() => db.sesiones.orderBy('fecha').toArray(), [], [])
}

export function usarTodosLosRegistros() {
  return useLiveQuery(() => db.registros.orderBy('fecha').toArray(), [], [])
}

export function usarAnaliticas() {
  return useLiveQuery(() => db.analiticas.orderBy('fecha').toArray(), [], [])
}

export function usarTodosLosEjercicios() {
  return useLiveQuery(() => db.ejercicios.orderBy('id').toArray(), [], [])
}
