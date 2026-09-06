import { calcularPuntaje, RENGLONES } from './puntaje'
import type { Alimento, Ejercicio, Peso, Perfil, RegistroDiario, SesionGym } from './tipos'

function celda(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function csv(filas: unknown[][]): string {
  return filas.map((f) => f.map(celda).join(',')).join('\n')
}

/** La BITACORA, con el puntaje ya calculado. Se abre en Excel sin tocar nada. */
export function bitacoraCSV(registros: RegistroDiario[], perfil: Perfil): string {
  const cabecera = [
    'fecha', 'tipo_dia',
    ...RENGLONES.filter((r) => r.esToggle).map((r) => r.clave),
    'agua_l', 'estudio_min', 'sueno_h', 'proteina_g', 'kcal', 'carb_g', 'grasa_g',
    'puntaje', 'pct', 'puntaje_aplicable', 'posibles_aplicables', 'notas',
  ]
  const filas = registros.map((r) => {
    const p = calcularPuntaje(r, perfil)
    return [
      r.fecha, r.tipoDia,
      ...RENGLONES.filter((d) => d.esToggle).map((d) => (r[d.clave as keyof RegistroDiario] ? 1 : 0)),
      r.aguaL, r.estudioMin, r.suenoH, r.proteinaG, r.kcal, r.carbG, r.grasaG,
      p.puntaje, p.pct === null ? '' : p.pct.toFixed(4), p.puntajeAplicable, p.posiblesAplicables, r.notas,
    ]
  })
  return csv([cabecera, ...filas])
}

export function pesosCSV(pesos: Peso[]): string {
  return csv([
    ['fecha', 'peso_lb', 'peso_kg', 'pct_grasa', 'cintura_cm', 'notas'],
    ...pesos.map((p) => [
      p.fecha, p.pesoLb, (p.pesoLb / 2.2046).toFixed(2),
      p.pctGrasa === null ? '' : (p.pctGrasa * 100).toFixed(1),
      p.cinturaCm, p.notas,
    ]),
  ])
}

/** Una fila por serie: es el grano que sirve para analizar la progresión. */
export function sesionesCSV(sesiones: SesionGym[], ejercicios: Map<number, Ejercicio>): string {
  const filas: unknown[][] = [
    ['fecha', 'dia_split', 'ejercicio', 'es_ancla', 'set', 'peso_lb', 'reps', 'rpe', 'completada', 'duracion_min'],
  ]
  for (const s of sesiones) {
    for (const serie of [...s.series].sort((a, b) => a.ejercicioId - b.ejercicioId || a.setNum - b.setNum)) {
      const e = ejercicios.get(serie.ejercicioId)
      filas.push([
        s.fecha, s.diaSplit, e?.nombre ?? serie.ejercicioId, e?.esAncla ? 1 : 0,
        serie.setNum, serie.pesoLb, serie.reps, serie.rpe, serie.completada ? 1 : 0, s.duracionMin,
      ])
    }
  }
  return csv(filas)
}

export function alimentosCSV(alimentos: Alimento[]): string {
  return csv([
    ['nombre', 'estado', 'kcal_100g', 'prot_100g', 'carb_100g', 'grasa_100g', 'medida', 'g_por_medida'],
    ...alimentos.map((a) => [
      a.nombre, a.estado, a.kcal100g, a.prot100g, a.carb100g, a.grasa100g, a.medidaComun, a.gramosPorMedida,
    ]),
  ])
}
