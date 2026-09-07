import type { Area } from '../../dominio/tipos'

/**
 * Las áreas del seguimiento. Las seis primeras son los renglones del estado
 * de resultados diario; las otras existen para metas y logros que no se
 * registran todos los días pero sí se siguen.
 */
export const AREAS: Area[] = [
  { id: 'DISCIPLINA BASE', nombre: 'Disciplina base', orden: 1, enPuntajeDiario: true },
  { id: 'ENTRENAMIENTO', nombre: 'Entrenamiento', orden: 2, enPuntajeDiario: true },
  { id: 'NUTRICIÓN', nombre: 'Nutrición', orden: 3, enPuntajeDiario: true },
  { id: 'VIDA ESPIRITUAL', nombre: 'Vida espiritual', orden: 4, enPuntajeDiario: true },
  { id: 'CAPITAL HUMANO', nombre: 'Capital humano', orden: 5, enPuntajeDiario: true },
  { id: 'RECUPERACIÓN', nombre: 'Recuperación', orden: 6, enPuntajeDiario: true },
  { id: 'SALUD', nombre: 'Salud', orden: 7, enPuntajeDiario: false },
  { id: 'COMPOSICIÓN', nombre: 'Composición corporal', orden: 8, enPuntajeDiario: false },
  { id: 'CARRERA', nombre: 'Carrera', orden: 9, enPuntajeDiario: false },
  { id: 'FINANZAS', nombre: 'Finanzas', orden: 10, enPuntajeDiario: false },
]
