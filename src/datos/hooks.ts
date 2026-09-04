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
