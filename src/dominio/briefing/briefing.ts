/**
 * Lógica del briefing: qué sesión toca, qué tan viejo es lo que estás viendo, y
 * si el archivo que llegó es de fiar.
 *
 * Nada aquí toca la red ni React.
 */
import type { FechaISO } from '../tipos'
import type { Briefing, Sesion } from './tipos'

/** El briefing de la mañana sale a las 6:00; el del cierre, a las 17:00. */
export const HORA_AM = 6
export const HORA_PM = 17

export function idBriefing(fecha: FechaISO, sesion: Sesion): string {
  return `${fecha}-${sesion.toLowerCase()}`
}

/**
 * Cuál es el briefing vigente a esta hora.
 *
 * Antes de las 6:00 todavía manda el cierre de AYER — a las 5 a.m. el briefing
 * de hoy no existe, y mostrar uno vacío sería peor que mostrar el de anoche.
 */
export function sesionVigente(fecha: FechaISO, hora: number): { fecha: FechaISO; sesion: Sesion } {
  if (hora >= HORA_PM) return { fecha, sesion: 'PM' }
  if (hora >= HORA_AM) return { fecha, sesion: 'AM' }
  return { fecha: diaAnterior(fecha), sesion: 'PM' }
}

/**
 * La sesión anterior a una dada: el cierre de la tarde precede a la mañana del
 * día siguiente.
 *
 * Existe porque el briefing de las 17:00 puede no haber salido todavía a las
 * 17:05, y mostrar una pantalla vacía cuando el de la mañana está ahí sería
 * peor que mostrarlo con su hora.
 */
export function sesionAnterior(v: { fecha: FechaISO; sesion: Sesion }): { fecha: FechaISO; sesion: Sesion } {
  return v.sesion === 'PM'
    ? { fecha: v.fecha, sesion: 'AM' }
    : { fecha: diaAnterior(v.fecha), sesion: 'PM' }
}

/** El día anterior, sin construir un Date: las zonas horarias corren los días. */
export function diaAnterior(fecha: FechaISO): FechaISO {
  const [a, m, d] = fecha.split('-').map(Number)
  if (d > 1) return `${a}-${String(m).padStart(2, '0')}-${String(d - 1).padStart(2, '0')}`
  const pa = m === 1 ? a - 1 : a
  const pm = m === 1 ? 12 : m - 1
  const bisiesto = (pa % 4 === 0 && pa % 100 !== 0) || pa % 400 === 0
  const dias = [31, bisiesto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][pm - 1]
  return `${pa}-${String(pm).padStart(2, '0')}-${String(dias).padStart(2, '0')}`
}

export interface Frescura {
  horas: number
  texto: string
  /** Más de 18 horas: ya no describe el mercado de hoy. */
  vencido: boolean
}

/**
 * Qué tan viejo es lo que estás leyendo. Se muestra SIEMPRE, con o sin señal:
 * un briefing sin su hora no se puede usar para decidir nada.
 */
export function frescura(generadoEn: string, ahora: number): Frescura {
  const t = Date.parse(generadoEn)
  if (!Number.isFinite(t)) return { horas: Infinity, texto: 'sin fecha', vencido: true }
  const horas = (ahora - t) / 3_600_000
  return { horas, texto: textoDeEdad(horas), vencido: horas > 18 }
}

function textoDeEdad(horas: number): string {
  if (horas < 0) return 'recién generado'
  if (horas < 1) {
    const min = Math.max(1, Math.round(horas * 60))
    return `de hace ${min} ${min === 1 ? 'minuto' : 'minutos'}`
  }
  if (horas < 24) {
    const h = Math.round(horas)
    return `de hace ${h} ${h === 1 ? 'hora' : 'horas'}`
  }
  const dias = Math.floor(horas / 24)
  return `de hace ${dias} ${dias === 1 ? 'día' : 'días'}`
}

/** Cuántos puntos trae, sin contar los bloques vacíos. */
export function totalPuntos(b: Briefing): number {
  return b.bloques.reduce((a, bl) => a + bl.puntos.length, 0)
}

export function fuenteDe(b: Briefing, id: number) {
  return b.fuentes.find((f) => f.id === id)
}

/**
 * El JSON llega de la red: se valida antes de creerle.
 *
 * Devuelve el briefing si la estructura está completa, o `null`. No repara ni
 * rellena: un briefing a medias con campos inventados es peor que ninguno.
 */
/** "2026-09-10" y nada más. Medir diez caracteres no basta: "10/09/2026" también mide diez. */
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/

export function validarBriefing(datos: unknown): Briefing | null {
  const b = datos as Partial<Briefing>
  if (!b || typeof b !== 'object') return null
  if (b.version !== 1) return null
  if (typeof b.id !== 'string' || typeof b.fecha !== 'string' || !FECHA_ISO.test(b.fecha)) return null
  if (b.sesion !== 'AM' && b.sesion !== 'PM') return null
  if (typeof b.generadoEn !== 'string' || !Number.isFinite(Date.parse(b.generadoEn))) return null
  if (!Array.isArray(b.mercados) || !Array.isArray(b.bloques) || !Array.isArray(b.fuentes)) return null

  const idsFuente = new Set(b.fuentes.map((f) => f?.id))
  // Un punto sin fuente no se muestra: es la regla que hace verificable el resto.
  const bloques = b.bloques
    .filter((bl) => bl && typeof bl.titulo === 'string' && Array.isArray(bl.puntos))
    .map((bl) => ({
      titulo: bl.titulo,
      puntos: bl.puntos.filter(
        (p) => p && typeof p.titulo === 'string' && idsFuente.has(p.fuenteId)
          && (p.tipo === 'HECHO' || p.tipo === 'PRONOSTICO'),
      ),
    }))
    .filter((bl) => bl.puntos.length > 0)

  return {
    version: 1,
    id: b.id,
    fecha: b.fecha,
    sesion: b.sesion,
    generadoEn: b.generadoEn,
    mercados: b.mercados.filter((c) => c && typeof c.nombre === 'string' && typeof c.valor === 'string'),
    bloques,
    lectura: Array.isArray(b.lectura) ? b.lectura.filter((l) => typeof l === 'string') : [],
    decisiones: Array.isArray(b.decisiones)
      ? b.decisiones.filter((d) => d && typeof d.texto === 'string').slice(0, 3)
      : [],
    fuentes: b.fuentes.filter((f) => f && typeof f.id === 'number' && typeof f.url === 'string'),
    faltantes: Array.isArray(b.faltantes) ? b.faltantes.filter((f) => typeof f === 'string') : [],
  }
}
