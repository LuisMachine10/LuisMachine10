import { db } from './db'
import { hoyISO } from '../dominio/dias'
import { logroDeMeta, medirMeta } from '../dominio/metas-personales'
import type { FuentesDeDatos } from '../dominio/metas-personales'
import type { CondicionSalud, Logro, MetaPersonal, Perfil } from '../dominio/tipos'

export async function guardarMeta(meta: Omit<MetaPersonal, 'id' | 'creadaEn'> & { id?: number }): Promise<number> {
  const existente = meta.id ? await db.metas.get(meta.id) : undefined
  return db.metas.put({ ...meta, creadaEn: existente?.creadaEn ?? Date.now() } as MetaPersonal)
}

export async function borrarMeta(id: number): Promise<void> {
  await db.metas.delete(id)
  await db.logros.where('metaId').equals(id).modify({ metaId: null })
}

export async function cambiarEstadoMeta(id: number, estado: MetaPersonal['estado']): Promise<void> {
  const meta = await db.metas.get(id)
  if (!meta) return
  await db.metas.put({ ...meta, estado })
  if (estado === 'lograda') await registrarLogroDeMeta(meta)
}

export async function actualizarValorManual(id: number, valor: number | null): Promise<void> {
  const meta = await db.metas.get(id)
  if (meta) await db.metas.put({ ...meta, valorManual: valor })
}

async function fuentes(perfil: Perfil): Promise<FuentesDeDatos> {
  const [pesos, analiticas, sesiones, registros] = await Promise.all([
    db.pesos.orderBy('fecha').toArray(),
    db.analiticas.orderBy('fecha').toArray(),
    db.sesiones.orderBy('fecha').toArray(),
    db.registros.orderBy('fecha').toArray(),
  ])
  return { pesos, analiticas, sesiones, registros, perfil }
}

async function registrarLogroDeMeta(meta: MetaPersonal): Promise<void> {
  if (!meta.id) return
  const yaExiste = await db.logros.where('metaId').equals(meta.id).count()
  if (yaExiste > 0) return
  const perfil = (await db.perfil.get('perfil'))!
  const m = medirMeta(meta, await fuentes(perfil))
  await db.logros.add(logroDeMeta(meta, m) as Logro)
}

/**
 * Cierra las metas que ya se cumplieron y deja el logro registrado.
 * Se llama sola al abrir la app: no depende de que te acuerdes de marcarlas.
 */
export async function cerrarMetasCumplidas(): Promise<number> {
  const perfil = await db.perfil.get('perfil')
  if (!perfil) return 0
  const datos = await fuentes(perfil)
  const activas = await db.metas.where('estado').equals('activa').toArray()
  let cerradas = 0
  for (const meta of activas) {
    if (meta.tipo === 'hito') continue
    if (medirMeta(meta, datos).alcanzada) {
      await db.metas.put({ ...meta, estado: 'lograda' })
      await registrarLogroDeMeta(meta)
      cerradas++
    }
  }
  return cerradas
}

export async function guardarLogro(logro: Omit<Logro, 'id'> & { id?: number }): Promise<void> {
  await db.logros.put(logro as Logro)
}

export async function borrarLogro(id: number): Promise<void> {
  await db.logros.delete(id)
}

export async function guardarCondicion(c: Omit<CondicionSalud, 'id'> & { id?: number }): Promise<void> {
  await db.condiciones.put(c as CondicionSalud)
}

export async function borrarCondicion(id: number): Promise<void> {
  await db.condiciones.delete(id)
}

/** Un PR nuevo en un ejercicio ancla merece quedar escrito. */
export async function registrarPR(
  ejercicioNombre: string, pesoLb: number, reps: number, area = 'ENTRENAMIENTO',
): Promise<void> {
  await db.logros.add({
    fecha: hoyISO(),
    area,
    titulo: `PR en ${ejercicioNombre}`,
    detalle: `${pesoLb} lb × ${reps} reps.`,
    metaId: null,
    valor: pesoLb,
    unidad: 'lb',
    origen: 'automatico',
  } as Logro)
}
