import Dexie, { type Table } from 'dexie'
import type { BriefingGuardado } from '../dominio/briefing/tipos'
import type { Cuenta, LineaPresupuesto, Movimiento } from '../dominio/capital/tipos'
import { PERFIL_VACIO } from '../dominio/metas'
import type {
  Alimento, Analitica, Area, BloqueHorario, CargaSemana, Comida, CondicionSalud, Ejercicio,
  EventoLiturgico, Logro, MenuGuardado, MetaPersonal, Peso, Perfil, RegistroDiario, SesionGym,
} from '../dominio/tipos'
import { ALIMENTOS } from './seed/alimentos'
import { AREAS } from './seed/areas'
import { EJERCICIOS } from './seed/ejercicios'
import { HORARIO } from './seed/horario'
import { LITURGICO } from './seed/liturgico'
import { MENUS } from './seed/menus'
import { PROGRESION } from './seed/progresion'

/** Subir esto vuelve a sembrar los catálogos (no toca lo que el usuario registró). */
const VERSION_SEED = 3

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
  areas!: Table<Area, string>
  metas!: Table<MetaPersonal, number>
  logros!: Table<Logro, number>
  condiciones!: Table<CondicionSalud, number>
  // Mena Capital — un solo libro; los estados son lecturas de él.
  cuentas!: Table<Cuenta, number>
  movimientos!: Table<Movimiento, number>
  presupuesto!: Table<LineaPresupuesto, number>
  /** El briefing bajado. Guardado para que el gimnasio y el avión no lo dejen en blanco. */
  briefings!: Table<BriefingGuardado, string>

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

    // v2 — el seguimiento deja de ser solo diario: metas con fecha y logros.
    this.version(2).stores({
      areas: 'id, orden',
      metas: '++id, area, estado, fechaLimite',
      logros: '++id, fecha, area, metaId',
      condiciones: '++id, activa',
    })

    // v3 — Mena Capital. Las cuentas y el libro de movimientos.
    this.version(3).stores({
      cuentas: '++id, clase, grupo, activa',
      movimientos: '++id, fecha, debe, haber, origen',
      presupuesto: '++id, mes, cuentaId',
    })

    // v4 — el briefing se guarda al bajarlo: sin señal se muestra el último.
    this.version(4).stores({
      briefings: 'id, descargadoEn',
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
    [db.perfil, db.alimentos, db.menus, db.ejercicios, db.progresion, db.horario, db.liturgico, db.ajustes, db.areas],
    async () => {
      if (!(await db.perfil.get('perfil'))) await db.perfil.put({ ...PERFIL_VACIO, creadoEn: Date.now() })
      if (yaSembrado) return
      await db.alimentos.bulkPut(ALIMENTOS)
      await db.menus.bulkPut(MENUS)
      await db.ejercicios.bulkPut(EJERCICIOS)
      await db.progresion.bulkPut(PROGRESION)
      await db.horario.bulkPut(HORARIO)
      await db.liturgico.bulkPut(LITURGICO)
      await db.areas.bulkPut(AREAS)
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
  metas: MetaPersonal[]
  logros: Logro[]
  condiciones: CondicionSalud[]
  cuentas: Cuenta[]
  movimientos: Movimiento[]
  presupuesto: LineaPresupuesto[]
}

/** Respaldo: solo lo que el usuario produjo. Los catálogos se resiembran solos. */
export async function exportarRespaldo(): Promise<Respaldo> {
  const [perfil, registros, pesos, comidas, sesiones, analiticas, ajustes, metas, logros, condiciones,
         cuentas, movimientos, presupuesto] =
    await Promise.all([
      db.perfil.toArray(),
      db.registros.toArray(),
      db.pesos.toArray(),
      db.comidas.toArray(),
      db.sesiones.toArray(),
      db.analiticas.toArray(),
      db.ajustes.toArray(),
      db.metas.toArray(),
      db.logros.toArray(),
      db.condiciones.toArray(),
      db.cuentas.toArray(),
      db.movimientos.toArray(),
      db.presupuesto.toArray(),
    ])
  return {
    app: 'sistema-mena',
    version: 3,
    exportadoEn: new Date().toISOString(),
    perfil, registros, pesos, comidas, sesiones, analiticas, ajustes, metas, logros, condiciones,
    cuentas, movimientos, presupuesto,
  }
}

export async function importarRespaldo(
  datos: unknown,
): Promise<{ registros: number; pesos: number; metas: number; logros: number; movimientos: number }> {
  const r = datos as Partial<Respaldo>
  if (!r || r.app !== 'sistema-mena') throw new Error('Ese archivo no es un respaldo de Sistema Mena.')
  await db.transaction(
    'rw',
    [db.perfil, db.registros, db.pesos, db.comidas, db.sesiones, db.analiticas, db.ajustes,
     db.metas, db.logros, db.condiciones, db.cuentas, db.movimientos, db.presupuesto],
    async () => {
      if (r.perfil?.length) await db.perfil.bulkPut(r.perfil)
      if (r.registros?.length) await db.registros.bulkPut(r.registros)
      if (r.pesos?.length) await db.pesos.bulkPut(r.pesos)
      if (r.comidas?.length) await db.comidas.bulkPut(r.comidas)
      if (r.sesiones?.length) await db.sesiones.bulkPut(r.sesiones)
      if (r.analiticas?.length) await db.analiticas.bulkPut(r.analiticas)
      if (r.ajustes?.length) await db.ajustes.bulkPut(r.ajustes)
      if (r.metas?.length) await db.metas.bulkPut(r.metas)
      if (r.logros?.length) await db.logros.bulkPut(r.logros)
      if (r.condiciones?.length) await db.condiciones.bulkPut(r.condiciones)
      if (r.cuentas?.length) await db.cuentas.bulkPut(r.cuentas)
      if (r.movimientos?.length) await db.movimientos.bulkPut(r.movimientos)
      if (r.presupuesto?.length) await db.presupuesto.bulkPut(r.presupuesto)
    },
  )
  return {
    registros: r.registros?.length ?? 0,
    pesos: r.pesos?.length ?? 0,
    metas: r.metas?.length ?? 0,
    logros: r.logros?.length ?? 0,
    movimientos: r.movimientos?.length ?? 0,
  }
}
