import type { BloqueHorario } from './tipos'

/** "17:30" → minutos desde medianoche. */
export function aMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

/**
 * El siguiente bloque del día. Si ya no queda ninguno, devuelve null:
 * el día se cerró, y eso también es información.
 */
export function siguienteBloque(bloques: BloqueHorario[], ahoraMin: number): BloqueHorario | null {
  const pendientes = bloques
    .filter((b) => aMinutos(b.hora) > ahoraMin)
    .sort((a, b) => aMinutos(a.hora) - aMinutos(b.hora))
  return pendientes[0] ?? null
}

export function minutosDeAhora(d = new Date()): number {
  return d.getHours() * 60 + d.getMinutes()
}
