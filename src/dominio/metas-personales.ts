import { hoyISO } from './dias'
import { estadoDeResultados } from './promedios'
import type {
  Analitica, FechaISO, Logro, MetaPersonal, Perfil, Peso, RegistroDiario, SesionGym,
} from './tipos'

/** Todo lo que la app ya sabe, para que las metas se midan solas. */
export interface FuentesDeDatos {
  pesos: Peso[]
  analiticas: Analitica[]
  sesiones: SesionGym[]
  registros: RegistroDiario[]
  perfil: Perfil
}

export interface MedicionMeta {
  valorActual: number | null
  /** 0 a 1. Null cuando falta el valor inicial o el actual. */
  progreso: number | null
  alcanzada: boolean
  /** De dónde salió el número, en palabras. Ningún dato sin procedencia. */
  procedencia: string
  diasRestantes: number | null
  /** Ritmo necesario por semana para llegar a tiempo. Null si no aplica. */
  ritmoNecesario: number | null
}

const ultimo = <T>(xs: T[]): T | undefined => xs[xs.length - 1]

function ultimaAnalitica(analiticas: Analitica[], campo: keyof Analitica): number | null {
  const conDato = analiticas.filter((a) => typeof a[campo] === 'number')
  const u = ultimo(conDato)
  return u ? (u[campo] as number) : null
}

/** El mejor peso completado en ese ejercicio, en toda la historia. */
function mejorPeso(sesiones: SesionGym[], ejercicioId: number): number | null {
  let mejor: number | null = null
  for (const s of sesiones) {
    for (const serie of s.series) {
      if (serie.ejercicioId === ejercicioId && serie.completada && serie.pesoLb !== null) {
        mejor = mejor === null ? serie.pesoLb : Math.max(mejor, serie.pesoLb)
      }
    }
  }
  return mejor
}

function valorDeFuente(meta: MetaPersonal, d: FuentesDeDatos): { valor: number | null; procedencia: string } {
  const f = meta.fuente
  if (f === 'manual') {
    return { valor: meta.valorManual, procedencia: 'Lo actualizas tú a mano' }
  }
  if (f === 'peso') {
    const u = ultimo(d.pesos)
    return { valor: u?.pesoLb ?? null, procedencia: u ? `Último pesaje (${u.fecha})` : 'Sin pesajes todavía' }
  }
  if (f === 'pctGrasa') {
    const conDato = d.pesos.filter((p) => p.pctGrasa !== null)
    const u = ultimo(conDato)
    return {
      valor: u ? u.pctGrasa! * 100 : null,
      procedencia: u ? `Última medición de grasa (${u.fecha})` : 'Sin medición de grasa',
    }
  }
  if (f === 'cintura') {
    const conDato = d.pesos.filter((p) => p.cinturaCm !== null)
    const u = ultimo(conDato)
    return { valor: u?.cinturaCm ?? null, procedencia: u ? `Última medida (${u.fecha})` : 'Sin medidas de cintura' }
  }
  if (f.startsWith('analitica:')) {
    const campo = f.split(':')[1] as keyof Analitica
    const valor = ultimaAnalitica(d.analiticas, campo)
    const u = ultimo(d.analiticas.filter((a) => typeof a[campo] === 'number'))
    return { valor, procedencia: u ? `Última analítica (${u.fecha})` : 'Sin analítica registrada' }
  }
  if (f.startsWith('ejercicio:')) {
    const id = Number(f.split(':')[1])
    const valor = mejorPeso(d.sesiones, id)
    return { valor, procedencia: valor === null ? 'Sin series completadas' : 'Mejor peso completado en el gimnasio' }
  }
  if (f === 'margenCumplimiento') {
    const e = estadoDeResultados(d.registros, d.perfil)
    return {
      valor: e.margen === null ? null : Math.round(e.margen * 100),
      procedencia: e.margen === null ? 'Sin días registrados' : `Margen sobre ${e.posibles} puntos posibles`,
    }
  }
  if (f === 'promedioEstudioMin' || f === 'promedioSuenoH') {
    const campo = f === 'promedioEstudioMin' ? 'estudioMin' : 'suenoH'
    const valores = d.registros.map((r) => r[campo]).filter((v): v is number => v !== null)
    if (valores.length === 0) return { valor: null, procedencia: 'Sin días con ese dato' }
    const promedio = valores.reduce((s, v) => s + v, 0) / valores.length
    return {
      valor: Math.round(promedio * 10) / 10,
      procedencia: `Promedio de ${valores.length} día${valores.length === 1 ? '' : 's'} con dato`,
    }
  }
  return { valor: null, procedencia: 'Fuente desconocida' }
}

function diasEntre(a: FechaISO, b: FechaISO): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

export function medirMeta(meta: MetaPersonal, d: FuentesDeDatos, hoy: FechaISO = hoyISO()): MedicionMeta {
  const { valor: valorActual, procedencia } = valorDeFuente(meta, d)
  const diasRestantes = meta.fechaLimite ? diasEntre(hoy, meta.fechaLimite) : null

  if (meta.tipo === 'hito') {
    return {
      valorActual,
      progreso: meta.estado === 'lograda' ? 1 : 0,
      alcanzada: meta.estado === 'lograda',
      procedencia: meta.estado === 'lograda' ? 'Marcado como logrado' : 'Pendiente',
      diasRestantes,
      ritmoNecesario: null,
    }
  }

  if (valorActual === null || meta.valorMeta === null) {
    return { valorActual, progreso: null, alcanzada: false, procedencia, diasRestantes, ritmoNecesario: null }
  }

  const alcanzada =
    meta.direccion === 'bajar' ? valorActual <= meta.valorMeta : valorActual >= meta.valorMeta

  let progreso: number | null = null
  if (meta.valorInicial !== null && meta.valorInicial !== meta.valorMeta) {
    const recorrido = valorActual - meta.valorInicial
    const total = meta.valorMeta - meta.valorInicial
    progreso = Math.max(0, Math.min(1, recorrido / total))
  } else {
    progreso = alcanzada ? 1 : 0
  }

  let ritmoNecesario: number | null = null
  if (diasRestantes !== null && diasRestantes > 0 && !alcanzada) {
    ritmoNecesario = Math.abs(meta.valorMeta - valorActual) / (diasRestantes / 7)
  }

  return { valorActual, progreso, alcanzada, procedencia, diasRestantes, ritmoNecesario }
}

export type Semaforo = 'lograda' | 'en-ritmo' | 'atrasada' | 'vencida' | 'sin-datos'

/**
 * Compara el avance real contra el tiempo transcurrido. Ir al 40% no dice nada
 * si no sabes que ya se te fue el 80% del plazo.
 */
export function semaforoMeta(meta: MetaPersonal, m: MedicionMeta, hoy: FechaISO = hoyISO()): Semaforo {
  if (m.alcanzada || meta.estado === 'lograda') return 'lograda'
  if (m.progreso === null) return 'sin-datos'
  if (m.diasRestantes !== null && m.diasRestantes < 0) return 'vencida'
  if (!meta.fechaLimite) return m.progreso > 0 ? 'en-ritmo' : 'sin-datos'
  const totalDias = diasEntre(meta.fechaInicio, meta.fechaLimite)
  if (totalDias <= 0) return m.progreso >= 1 ? 'lograda' : 'atrasada'
  const transcurrido = Math.max(0, diasEntre(meta.fechaInicio, hoy)) / totalDias
  // Un 10% de holgura: el progreso rara vez es lineal y no quiero falsas alarmas.
  return m.progreso >= transcurrido - 0.1 ? 'en-ritmo' : 'atrasada'
}

export const ETIQUETA_SEMAFORO: Record<Semaforo, string> = {
  lograda: 'Lograda',
  'en-ritmo': 'En ritmo',
  atrasada: 'Atrasada para la fecha',
  vencida: 'Se venció el plazo',
  'sin-datos': 'Falta el dato',
}

/** Un logro que la app puede proponer sola cuando una meta se cumple. */
export function logroDeMeta(meta: MetaPersonal, m: MedicionMeta, hoy: FechaISO = hoyISO()): Omit<Logro, 'id'> {
  return {
    fecha: hoy,
    area: meta.area,
    titulo: meta.nombre,
    detalle: `Meta alcanzada: ${m.valorActual ?? '—'} ${meta.unidad} (objetivo ${meta.valorMeta ?? '—'} ${meta.unidad}).`,
    metaId: meta.id ?? null,
    valor: m.valorActual,
    unidad: meta.unidad,
    origen: 'automatico',
  }
}

export interface ResumenMetas {
  total: number
  logradas: number
  enRitmo: number
  atrasadas: number
  sinDatos: number
}

export function resumirMetas(
  metas: MetaPersonal[], d: FuentesDeDatos, hoy: FechaISO = hoyISO(),
): ResumenMetas {
  const activas = metas.filter((m) => m.estado !== 'pausada')
  const semaforos = activas.map((m) => semaforoMeta(m, medirMeta(m, d, hoy), hoy))
  return {
    total: activas.length,
    logradas: semaforos.filter((s) => s === 'lograda').length,
    enRitmo: semaforos.filter((s) => s === 'en-ritmo').length,
    atrasadas: semaforos.filter((s) => s === 'atrasada' || s === 'vencida').length,
    sinDatos: semaforos.filter((s) => s === 'sin-datos').length,
  }
}

