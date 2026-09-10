/**
 * Meses sin líos de zona horaria, igual que `dominio/dias.ts` hace con los días.
 * Un MesISO es "2026-09" y se manipula como texto, nunca como Date.
 */
import type { FechaISO } from '../tipos'
import type { MesISO } from './tipos'

const NOMBRES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export function mesDe(fecha: FechaISO): MesISO {
  return fecha.slice(0, 7)
}

export function partesMes(mes: MesISO): { anio: number; mesNum: number } {
  return { anio: Number(mes.slice(0, 4)), mesNum: Number(mes.slice(5, 7)) }
}

export function sumarMeses(mes: MesISO, n: number): MesISO {
  const { anio, mesNum } = partesMes(mes)
  const total = anio * 12 + (mesNum - 1) + n
  const a = Math.floor(total / 12)
  const m = (total % 12) + 1
  return `${a}-${String(m).padStart(2, '0')}`
}

export function mesAnterior(mes: MesISO): MesISO {
  return sumarMeses(mes, -1)
}

export function primerDia(mes: MesISO): FechaISO {
  return `${mes}-01`
}

export function diasDelMes(mes: MesISO): number {
  const { anio, mesNum } = partesMes(mes)
  return [31, bisiesto(anio) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mesNum - 1]
}

export function ultimoDia(mes: MesISO): FechaISO {
  return `${mes}-${String(diasDelMes(mes)).padStart(2, '0')}`
}

function bisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0
}

/** Ambos extremos incluidos. Si `hasta` es anterior a `desde`, devuelve vacío. */
export function rangoMeses(desde: MesISO, hasta: MesISO): MesISO[] {
  const salida: MesISO[] = []
  let cursor = desde
  for (let i = 0; i < 600 && cursor <= hasta; i++) {
    salida.push(cursor)
    cursor = sumarMeses(cursor, 1)
  }
  return salida
}

/** Los últimos n meses terminando en `hasta`, en orden cronológico. */
export function ultimosMeses(hasta: MesISO, n: number): MesISO[] {
  return rangoMeses(sumarMeses(hasta, -(n - 1)), hasta)
}

export function nombreMes(mes: MesISO): string {
  const { anio, mesNum } = partesMes(mes)
  return `${NOMBRES[mesNum - 1]} ${anio}`
}

/** "sep 26" — para ejes de gráficas, donde no cabe el nombre completo. */
export function mesCorto(mes: MesISO): string {
  const { anio, mesNum } = partesMes(mes)
  return `${NOMBRES[mesNum - 1].slice(0, 3)} ${String(anio).slice(2)}`
}
