import { db } from './db'
import { guardarRegistro } from './registros'
import type { FechaISO, SerieRegistrada, SesionGym } from '../dominio/tipos'

async function sesionDe(fecha: FechaISO, diaSplit: 1 | 2 | 3 | 4): Promise<SesionGym> {
  const existente = await db.sesiones.where('fecha').equals(fecha).first()
  return existente ?? { fecha, diaSplit, duracionMin: null, series: [] }
}

/**
 * Guarda una serie. Al cerrar la primera, marca el hábito "Entrenamiento"
 * del día: registrar la sesión ya es registrar el entrenamiento.
 */
export async function guardarSerie(
  fecha: FechaISO, diaSplit: 1 | 2 | 3 | 4, serie: SerieRegistrada,
): Promise<void> {
  const sesion = await sesionDe(fecha, diaSplit)
  const i = sesion.series.findIndex(
    (s) => s.ejercicioId === serie.ejercicioId && s.setNum === serie.setNum,
  )
  const series = i >= 0 ? sesion.series.map((s, j) => (j === i ? serie : s)) : [...sesion.series, serie]
  await db.sesiones.put({ ...sesion, diaSplit, series })
  if (series.some((s) => s.completada)) {
    await guardarRegistro(fecha, { entrenamiento: true })
  }
}

export async function borrarSerie(
  fecha: FechaISO, ejercicioId: number, setNum: number,
): Promise<void> {
  const sesion = await db.sesiones.where('fecha').equals(fecha).first()
  if (!sesion) return
  await db.sesiones.put({
    ...sesion,
    series: sesion.series.filter((s) => !(s.ejercicioId === ejercicioId && s.setNum === setNum)),
  })
}

export async function guardarDuracion(
  fecha: FechaISO, diaSplit: 1 | 2 | 3 | 4, duracionMin: number | null,
): Promise<void> {
  const sesion = await sesionDe(fecha, diaSplit)
  await db.sesiones.put({ ...sesion, diaSplit, duracionMin })
}

/** El último peso que de verdad levantaste en ese ejercicio. Manda sobre el plan. */
export async function ultimoPeso(ejercicioId: number, antesDe: FechaISO): Promise<number | null> {
  const sesiones = await db.sesiones.orderBy('fecha').toArray()
  for (let i = sesiones.length - 1; i >= 0; i--) {
    if (sesiones[i].fecha >= antesDe) continue
    const series = sesiones[i].series.filter((s) => s.ejercicioId === ejercicioId && s.pesoLb)
    if (series.length > 0) return series[series.length - 1].pesoLb
  }
  return null
}
