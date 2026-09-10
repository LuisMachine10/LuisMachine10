/**
 * El briefing, del archivo a la pantalla.
 *
 * Se baja del propio origen de la app (`/briefing/…`), lo que evita CORS por
 * completo: quien salió a CNBC fue el agente, no el navegador. Lo que se baja se
 * guarda, así que sin señal la pantalla muestra el último con su hora — nunca
 * una pantalla en blanco ni un error.
 */
import { idBriefing, sesionAnterior, sesionVigente, validarBriefing } from '../dominio/briefing/briefing'
import type { Briefing, BriefingGuardado, Sesion } from '../dominio/briefing/tipos'
import type { FechaISO } from '../dominio/tipos'
import { db } from './db'

const RUTA = (id: string) => `${import.meta.env.BASE_URL}briefing/${id}.json`

export async function guardarBriefing(b: Briefing): Promise<void> {
  await db.briefings.put({ id: b.id, briefing: b, descargadoEn: Date.now() })
}

export async function briefingLocal(id: string): Promise<BriefingGuardado | undefined> {
  return db.briefings.get(id)
}

/** El más reciente que se haya bajado alguna vez. El respaldo cuando no hay señal. */
export async function ultimoBriefingLocal(): Promise<BriefingGuardado | undefined> {
  const todos = await db.briefings.toArray()
  return todos.sort((a, b) => (a.briefing.id < b.briefing.id ? 1 : -1))[0]
}

/**
 * Intenta bajar un briefing. Devuelve `null` si no está o si no hay señal — no
 * lanza: quedarse sin internet no es un error de la app, es martes.
 */
export async function bajarBriefing(id: string): Promise<Briefing | null> {
  try {
    const res = await fetch(RUTA(id), { cache: 'no-cache' })
    if (!res.ok) return null
    const b = validarBriefing(await res.json())
    if (b) await guardarBriefing(b)
    return b
  } catch {
    return null
  }
}

export interface ResultadoBriefing {
  briefing: Briefing | null
  /** true cuando lo que se muestra salió del guardado, no de la red. */
  deLaMemoria: boolean
  /** El briefing que tocaba a esta hora, exista o no. */
  esperado: { fecha: FechaISO; sesion: Sesion }
}

/**
 * Lo que hay que mostrar ahora, en cascada. Nunca una pantalla en blanco:
 *
 *   1. El de esta sesión, si ya se bajó (y se refresca por detrás).
 *   2. El de esta sesión, bajándolo.
 *   3. El de la sesión anterior — a las 17:05 el del cierre puede no haber
 *      salido, y el de la mañana sigue sirviendo si dice de cuándo es.
 *   4. El más reciente que exista guardado.
 *
 * Cada paso marca `deLaMemoria` para que la pantalla pueda decir la verdad
 * sobre lo que estás viendo.
 */
export async function briefingVigente(fecha: FechaISO, hora: number): Promise<ResultadoBriefing> {
  const esperado = sesionVigente(fecha, hora)

  for (const v of [esperado, sesionAnterior(esperado)]) {
    const id = idBriefing(v.fecha, v.sesion)
    const local = await briefingLocal(id)
    if (local) {
      // Ya lo tenemos; se refresca en segundo plano por si lo corrigieron.
      bajarBriefing(id).catch(() => {})
      return { briefing: local.briefing, deLaMemoria: true, esperado }
    }
    const bajado = await bajarBriefing(id)
    if (bajado) return { briefing: bajado, deLaMemoria: false, esperado }
  }

  const ultimo = await ultimoBriefingLocal()
  return { briefing: ultimo?.briefing ?? null, deLaMemoria: true, esperado }
}
