import Dexie, { type Table } from 'dexie'
import { PERFIL_INICIAL } from '../dominio/metas'
import type {
  Alimento, Analitica, BloqueHorario, CargaSemana, Comida, Ejercicio, EventoLiturgico,
  MenuGuardado, Peso, Perfil, RegistroDiario, SesionGym,
} from '../dominio/tipos'
import { ALIMENTOS } from './seed/alimentos'
import { EJERCICIOS } from './seed/ejercicios'
import { HORARIO } from './seed/horario'
import { LITURGICO } from './seed/liturgico'
import { MENUS } from './seed/menus'
import { PROGRESION } from './seed/progresion'

/** Subir esto vuelve a sembrar los catálogos (no toca lo que el usuario registró). */
const VERSION_SEED = 2

/** Primer día de la BITACORA del Excel. */
export const INICIO_PLAN = '2026-09-07'

export interface Ajuste {
  clave: string
  valor: string | number | boolean
}

export class BaseMena extends Dexie {
  perfil!: Table<Perfil, string>
  alimentos!: Table<Alimento, number>
  menus!: Table<MenuGuardado, number>
  ejercicios!: Table<Ejercicio, number>
  progresion!: Table<CargaSemana, number>
  horario!: Table<BloqueHorario, number>
  liturgico!: Table<EventoLiturgico, number>
  registros!: Table<RegistroDiario, string>
  pesos!: Table<Peso, string>
  comidas!: Table<Comida, number>
  sesiones!: Table<SesionGym, number>
  analiticas!: Table<Analitica, string>
  ajustes!: Table<Ajuste, string>

  constructor() {
    super('sistema-mena')
    this.version(1).stores({
      perfil: 'id',
      alimentos: 'id, nombre, favorito',
      menus: 'id, tipoDia, tipo',
      ejercicios: 'id, dia',
      progresion: 'semana',
      horario: 'id, dia',
      liturgico: 'id',
      registros: 'fecha, tipoDia',
      pesos: 'fecha',
      comidas: '++id, fecha, tipo',
      sesiones: '++id, fecha, diaSplit',
      analiticas: 'fecha',
      ajustes: 'clave',
    })
  }
}

export const db = new BaseMena()

/**
 * Siembra los catálogos desde el Excel. Es idempotente: los datos que el
 * usuario registró (registros, pesos, comidas, sesiones) nunca se tocan.
 */
export async function sembrar(): Promise<void> {
  const marca = await db.ajustes.get('versionSeed')
  const yaSembrado = marca?.valor === VERSION_SEED

  await db.transaction(
    'rw',
    [db.perfil, db.alimentos, db.menus, db.ejercicios, db.progresion, db.horario, db.liturgico, db.ajustes],
    async () => {
      if (!(await db.perfil.get('perfil'))) await db.perfil.put(PERFIL_INICIAL)
      if (yaSembrado) return
      await db.alimentos.bulkPut(ALIMENTOS)
      await db.menus.bulkPut(MENUS)
      await db.ejercicios.bulkPut(EJERCICIOS)
      await db.progresion.bulkPut(PROGRESION)
      await db.horario.bulkPut(HORARIO)
      await db.liturgico.bulkPut(LITURGICO)
      await db.ajustes.put({ clave: 'versionSeed', valor: VERSION_SEED })
      if (!(await db.ajustes.get('inicioPlan'))) {
        await db.ajustes.put({ clave: 'inicioPlan', valor: INICIO_PLAN })
      }
    },
  )
}

export interface Respaldo {
  app: 'sistema-mena'
  version: number
  exportadoEn: string
  perfil: Perfil[]
  registros: RegistroDiario[]
  pesos: Peso[]
  comidas: Comida[]
  sesiones: SesionGym[]
  analiticas: Analitica[]
  ajustes: Ajuste[]
}

/** Respaldo: solo lo que el usuario produjo. Los catálogos se resiembran solos. */
export async function exportarRespaldo(): Promise<Respaldo> {
  const [perfil, registros, pesos, comidas, sesiones, analiticas, ajustes] = await Promise.all([
    db.perfil.toArray(),
    db.registros.toArray(),
    db.pesos.toArray(),
    db.comidas.toArray(),
    db.sesiones.toArray(),
    db.analiticas.toArray(),
    db.ajustes.toArray(),
  ])
  return {
    app: 'sistema-mena',
    version: 1,
    exportadoEn: new Date().toISOString(),
    perfil, registros, pesos, comidas, sesiones, analiticas, ajustes,
  }
}

export async function importarRespaldo(datos: unknown): Promise<{ registros: number; pesos: number }> {
  const r = datos as Partial<Respaldo>
  if (!r || r.app !== 'sistema-mena') throw new Error('Ese archivo no es un respaldo de Sistema Mena.')
  await db.transaction(
    'rw',
    [db.perfil, db.registros, db.pesos, db.comidas, db.sesiones, db.analiticas, db.ajustes],
    async () => {
      if (r.perfil?.length) await db.perfil.bulkPut(r.perfil)
      if (r.registros?.length) await db.registros.bulkPut(r.registros)
      if (r.pesos?.length) await db.pesos.bulkPut(r.pesos)
      if (r.comidas?.length) await db.comidas.bulkPut(r.comidas)
      if (r.sesiones?.length) await db.sesiones.bulkPut(r.sesiones)
      if (r.analiticas?.length) await db.analiticas.bulkPut(r.analiticas)
      if (r.ajustes?.length) await db.ajustes.bulkPut(r.ajustes)
    },
  )
  return { registros: r.registros?.length ?? 0, pesos: r.pesos?.length ?? 0 }
}
