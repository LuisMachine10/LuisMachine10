import type { DiaSemana, FechaISO, TipoDia } from './tipos'

const NOMBRES_DIA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** Fecha local en ISO corto. Nunca usar toISOString(): desplaza el día en RD (UTC−4). */
export function aISO(d: Date): FechaISO {
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

export function desdeISO(f: FechaISO): Date {
  const [a, m, d] = f.split('-').map(Number)
  return new Date(a, m - 1, d)
}

export function hoyISO(ahora = new Date()): FechaISO {
  return aISO(ahora)
}

export function sumarDias(f: FechaISO, n: number): FechaISO {
  const d = desdeISO(f)
  d.setDate(d.getDate() + n)
  return aISO(d)
}

/** 1 = lunes … 7 = domingo. */
export function diaSemana(f: FechaISO): DiaSemana {
  const js = desdeISO(f).getDay()
  return (js === 0 ? 7 : js) as DiaSemana
}

export function nombreDia(f: FechaISO): string {
  return NOMBRES_DIA[diaSemana(f) - 1]
}

export function fechaLarga(f: FechaISO): string {
  const d = desdeISO(f)
  return `${nombreDia(f)} ${d.getDate()} de ${MESES[d.getMonth()]}`
}

/** §4.4 — Lunes a jueves ENTRENO, viernes AYUNO, fin de semana LIGERO. Editable por día. */
export function tipoDiaPorDefecto(f: FechaISO): TipoDia {
  const d = diaSemana(f)
  if (d <= 4) return 'ENTRENO'
  if (d === 5) return 'AYUNO'
  return 'LIGERO'
}

/** §4.5 — El split. null = no toca pesas ese día. */
export function diaSplit(f: FechaISO): 1 | 2 | 3 | 4 | null {
  const d = diaSemana(f)
  return d <= 4 ? ((d as 1 | 2 | 3 | 4)) : null
}

export const TITULOS_SPLIT: Record<1 | 2 | 3 | 4, string> = {
  1: 'Día 1 — Pecho / Tríceps / Antebrazo / Core',
  2: 'Día 2 — Espalda / Bíceps / Deltoide posterior / Core',
  3: 'Día 3 — Pecho + Espalda / Hombro / Core (superseries)',
  4: 'Día 4 — Pierna (prensa, empuje de cadera, máquinas)',
}

/** Qué pide el plan ese día cuando no hay pesas. */
export const PLAN_SIN_PESAS: Record<5 | 6 | 7, string> = {
  5: 'Ayuno + descanso — solo caminata 40-50 min',
  6: 'Carrera 40-50 min + baloncesto PUCMM',
  7: 'Descanso total — lavado, meal prep, estudio',
}

export function tituloDelDia(f: FechaISO): string {
  const ds = diaSplit(f)
  if (ds) return TITULOS_SPLIT[ds]
  return PLAN_SIN_PESAS[diaSemana(f) as 5 | 6 | 7]
}

/** Semana 1..12 del plan, contada desde el arranque. Fuera de rango devuelve null. */
export function semanaDelPlan(f: FechaISO, inicio: FechaISO): number | null {
  const dias = Math.floor((desdeISO(f).getTime() - desdeISO(inicio).getTime()) / 86_400_000)
  if (dias < 0) return null
  const semana = Math.floor(dias / 7) + 1
  return semana <= 12 ? semana : null
}
