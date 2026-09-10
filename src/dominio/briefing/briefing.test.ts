import { describe, expect, it } from 'vitest'
import {
  diaAnterior, frescura, fuenteDe, idBriefing, sesionAnterior, sesionVigente, totalPuntos,
  validarBriefing,
} from './briefing'
import type { Briefing } from './tipos'

const BASE: Briefing = {
  version: 1,
  id: '2026-09-10-am',
  fecha: '2026-09-10',
  sesion: 'AM',
  generadoEn: '2026-09-10T06:02:00-04:00',
  mercados: [
    { nombre: 'S&P 500', valor: '6,412.30', cambio: '−0.65%', direccion: 'baja', comoDe: 'cierre 9 sep', fuenteId: 1 },
  ],
  bloques: [
    { titulo: 'Lo que mueve tu capital', puntos: [
      { titulo: 'Petróleo sobre US$100', detalle: 'WTI cerró en 102.48', quePide: 'Revisar exposición a energía', tipo: 'HECHO', fuenteId: 1 },
    ] },
  ],
  lectura: ['El mercado paga inflación, no crecimiento.'],
  decisiones: [],
  fuentes: [{ id: 1, medio: 'CNBC', titulo: 'Stock market today', url: 'https://www.cnbc.com/x', fecha: '2026-09-09' }],
  faltantes: [],
}

describe('qué briefing toca a esta hora', () => {
  it('a las 7 de la mañana manda el de la mañana', () => {
    expect(sesionVigente('2026-09-10', 7)).toEqual({ fecha: '2026-09-10', sesion: 'AM' })
  })

  it('a las 6 en punto ya salió el de la mañana', () => {
    expect(sesionVigente('2026-09-10', 6)).toEqual({ fecha: '2026-09-10', sesion: 'AM' })
  })

  it('desde las 5 de la tarde manda el del cierre', () => {
    expect(sesionVigente('2026-09-10', 17)).toEqual({ fecha: '2026-09-10', sesion: 'PM' })
    expect(sesionVigente('2026-09-10', 23)).toEqual({ fecha: '2026-09-10', sesion: 'PM' })
  })

  it('a las 5 a.m. todavía manda el cierre de ayer, no un briefing vacío', () => {
    expect(sesionVigente('2026-09-10', 5)).toEqual({ fecha: '2026-09-09', sesion: 'PM' })
  })

  it('a las 5 a.m. del primero de mes retrocede al mes anterior', () => {
    expect(sesionVigente('2026-09-01', 4)).toEqual({ fecha: '2026-08-31', sesion: 'PM' })
    expect(sesionVigente('2026-01-01', 4)).toEqual({ fecha: '2025-12-31', sesion: 'PM' })
    expect(sesionVigente('2028-03-01', 4)).toEqual({ fecha: '2028-02-29', sesion: 'PM' })
  })

  it('arma el identificador del archivo', () => {
    expect(idBriefing('2026-09-10', 'PM')).toBe('2026-09-10-pm')
  })

  it('retrocede un día sin usar Date, que corre las fechas por zona horaria', () => {
    expect(diaAnterior('2026-03-01')).toBe('2026-02-28')
    expect(diaAnterior('2026-09-10')).toBe('2026-09-09')
  })
})

describe('qué tan viejo es lo que estoy leyendo', () => {
  const generado = Date.parse('2026-09-10T06:02:00-04:00')

  it('cuenta minutos, horas y días en palabras', () => {
    expect(frescura(BASE.generadoEn, generado + 20 * 60_000).texto).toBe('de hace 20 minutos')
    expect(frescura(BASE.generadoEn, generado + 3 * 3_600_000).texto).toBe('de hace 3 horas')
    expect(frescura(BASE.generadoEn, generado + 50 * 3_600_000).texto).toBe('de hace 2 días')
  })

  it('pasadas 18 horas ya no describe el mercado de hoy', () => {
    expect(frescura(BASE.generadoEn, generado + 5 * 3_600_000).vencido).toBe(false)
    expect(frescura(BASE.generadoEn, generado + 19 * 3_600_000).vencido).toBe(true)
  })

  it('una fecha ilegible se trata como vencida, no se ignora', () => {
    const f = frescura('ayer por la tarde', generado)
    expect(f.vencido).toBe(true)
    expect(f.texto).toBe('sin fecha')
  })
})

describe('el JSON llega de la red: se valida antes de creerle', () => {
  it('acepta un briefing completo', () => {
    const v = validarBriefing(BASE)!
    expect(v.id).toBe('2026-09-10-am')
    expect(totalPuntos(v)).toBe(1)
    expect(fuenteDe(v, 1)!.medio).toBe('CNBC')
  })

  it('rechaza lo que no es un briefing', () => {
    expect(validarBriefing(null)).toBeNull()
    expect(validarBriefing({})).toBeNull()
    expect(validarBriefing({ ...BASE, version: 2 })).toBeNull()
    expect(validarBriefing({ ...BASE, sesion: 'TARDE' })).toBeNull()
    expect(validarBriefing({ ...BASE, fecha: '10/09/2026' })).toBeNull()
    expect(validarBriefing({ ...BASE, generadoEn: 'hoy temprano' })).toBeNull()
  })

  it('descarta los puntos sin fuente: es la regla que hace verificable el resto', () => {
    const conHuerfano = {
      ...BASE,
      bloques: [{ titulo: 'Mercados', puntos: [
        { titulo: 'Sin respaldo', detalle: 'x', quePide: 'y', tipo: 'HECHO', fuenteId: 99 },
        { titulo: 'Con respaldo', detalle: 'x', quePide: 'y', tipo: 'HECHO', fuenteId: 1 },
      ] }],
    }
    const v = validarBriefing(conHuerfano)!
    expect(totalPuntos(v)).toBe(1)
    expect(v.bloques[0].puntos[0].titulo).toBe('Con respaldo')
  })

  it('descarta un punto que no dice si es hecho o pronóstico', () => {
    const v = validarBriefing({
      ...BASE,
      bloques: [{ titulo: 'x', puntos: [{ titulo: 'a', detalle: 'b', quePide: 'c', tipo: 'QUIZAS', fuenteId: 1 }] }],
    })!
    expect(totalPuntos(v)).toBe(0)
  })

  it('no deja bloques vacíos en pantalla', () => {
    const v = validarBriefing({ ...BASE, bloques: [{ titulo: 'Vacío', puntos: [] }, ...BASE.bloques] })!
    expect(v.bloques).toHaveLength(1)
  })

  it('nunca muestra más de tres decisiones', () => {
    const muchas = Array.from({ length: 6 }, (_, i) => ({ texto: `d${i}`, porQue: 'x' }))
    expect(validarBriefing({ ...BASE, decisiones: muchas })!.decisiones).toHaveLength(3)
  })

  it('sin decisiones es un resultado válido, no un error', () => {
    expect(validarBriefing(BASE)!.decisiones).toEqual([])
  })
})

describe('la cascada: nunca una pantalla en blanco', () => {
  it('antes del de la tarde, el de la mañana del mismo día', () => {
    // A las 17:05 el del cierre puede no haber salido todavía.
    expect(sesionAnterior({ fecha: '2026-09-10', sesion: 'PM' }))
      .toEqual({ fecha: '2026-09-10', sesion: 'AM' })
  })

  it('antes del de la mañana, el cierre de ayer', () => {
    expect(sesionAnterior({ fecha: '2026-09-10', sesion: 'AM' }))
      .toEqual({ fecha: '2026-09-09', sesion: 'PM' })
  })

  it('cruza el cambio de mes hacia atrás sin romperse', () => {
    expect(sesionAnterior({ fecha: '2026-09-01', sesion: 'AM' }))
      .toEqual({ fecha: '2026-08-31', sesion: 'PM' })
  })
})
