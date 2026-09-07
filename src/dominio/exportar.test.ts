import { describe, expect, it } from 'vitest'
import { EJERCICIOS } from '../datos/seed/ejercicios'
import { bitacoraCSV, pesosCSV, sesionesCSV } from './exportar'
import { PERFIL_SUGERIDO } from './metas'
import { registroVacio } from './puntaje'
import type { Ejercicio } from './tipos'

const mapa = new Map<number, Ejercicio>(EJERCICIOS.map((e) => [e.id, e]))

describe('exportación a CSV', () => {
  it('la bitácora incluye el puntaje ya calculado', () => {
    const csv = bitacoraCSV(
      [{ ...registroVacio('2026-09-07', 'ENTRENO'), levantar5am: true, camaBulto: true }],
      PERFIL_SUGERIDO,
    )
    const [cabecera, fila] = csv.split('\n')
    expect(cabecera).toContain('puntaje')
    expect(cabecera).toContain('puntaje_aplicable')
    expect(fila.split(',')).toContain('12') // 8 + 4
  })

  it('un día sin registrar sale vacío, no como cero', () => {
    const csv = bitacoraCSV([registroVacio('2026-09-07', 'ENTRENO')], PERFIL_SUGERIDO)
    const columnas = csv.split('\n')[1].split(',')
    const idx = csv.split('\n')[0].split(',').indexOf('puntaje')
    expect(columnas[idx]).toBe('')
  })

  it('escapa comas y comillas de las notas', () => {
    const csv = bitacoraCSV(
      [{ ...registroVacio('2026-09-07', 'ENTRENO'), rosario: true, notas: 'Comí "mucho", dormí poco' }],
      PERFIL_SUGERIDO,
    )
    expect(csv).toContain('"Comí ""mucho"", dormí poco"')
    expect(csv.split('\n')).toHaveLength(2)
  })

  it('los pesos traen kilos y porcentaje de grasa legibles', () => {
    const csv = pesosCSV([{ fecha: '2026-09-05', pesoLb: 220, pctGrasa: 0.21, cinturaCm: 96, notas: '' }])
    expect(csv.split('\n')[1]).toBe('2026-09-05,220,99.79,21.0,96,')
  })

  it('las sesiones salen a una fila por serie, con el nombre del ejercicio', () => {
    const csv = sesionesCSV(
      [{
        fecha: '2026-09-07', diaSplit: 1, duracionMin: 70,
        series: [
          { ejercicioId: 2, setNum: 1, pesoLb: 215, reps: 6, rpe: 8, completada: true },
          { ejercicioId: 2, setNum: 2, pesoLb: 215, reps: 5, rpe: 9, completada: true },
        ],
      }],
      mapa,
    )
    const filas = csv.split('\n')
    expect(filas).toHaveLength(3)
    expect(filas[1]).toContain('Press de banca con barra')
    expect(filas[1]).toContain(',1,') // marcado como ancla
  })
})
