import { describe, expect, it } from 'vitest'
import { PERFIL_SUGERIDO, PERFIL_VACIO } from './metas'
import { camposFaltantes, edadDe, estadoDelSistema, perfilUsable } from './perfil'

describe('la edad se calcula, no se escribe', () => {
  const con = (nac: string | null, edad = 0) => ({ ...PERFIL_VACIO, fechaNacimiento: nac, edad })

  it('cuenta los años cumplidos a la fecha de hoy', () => {
    expect(edadDe(con('2004-03-15'), '2026-09-06')).toBe(22)
    expect(edadDe(con('2004-09-06'), '2026-09-06')).toBe(22)
  })

  it('no cuenta el cumpleaños hasta que llega', () => {
    expect(edadDe(con('2004-09-07'), '2026-09-06')).toBe(21)
    expect(edadDe(con('2004-12-31'), '2026-09-06')).toBe(21)
  })

  it('sin fecha de nacimiento usa el número que escribiste', () => {
    expect(edadDe(con(null, 22), '2026-09-06')).toBe(22)
  })
})

describe('la app no calcula sobre datos que no tiene', () => {
  it('un perfil en blanco no es usable y dice exactamente qué falta', () => {
    expect(perfilUsable(PERFIL_VACIO)).toBe(false)
    const faltan = camposFaltantes(PERFIL_VACIO).map((f) => f.campo)
    expect(faltan).toContain('nombre')
    expect(faltan).toContain('pesoLb')
    expect(faltan).toContain('estaturaCm')
    expect(faltan).toContain('pctGrasaEstimado')
    expect(faltan).toContain('fechaNacimiento')
  })

  it('con nombre, cuerpo y edad ya es usable', () => {
    expect(perfilUsable({ ...PERFIL_SUGERIDO, nombre: 'Luis' })).toBe(true)
  })

  it('un peso en cero cuenta como faltante, no como dato', () => {
    const p = { ...PERFIL_SUGERIDO, nombre: 'Luis', pesoLb: 0 }
    expect(camposFaltantes(p).map((f) => f.campo)).toEqual(['pesoLb'])
  })
})

describe('el sistema se arma por pasos y dice cuál sigue', () => {
  const listo = { ...PERFIL_SUGERIDO, nombre: 'Luis', completado: true }

  it('sin perfil, el paso es el perfil', () => {
    const e = estadoDelSistema(PERFIL_VACIO, 0, 0, 0)
    expect(e.paso).toBe('perfil')
    expect(e.siguientePaso).toContain('información')
  })

  it('un perfil usable pero sin confirmar sigue siendo el paso 1', () => {
    expect(estadoDelSistema({ ...listo, completado: false }, 5, 5, 5).paso).toBe('perfil')
  })

  it('con perfil pero sin metas, el paso son las metas', () => {
    const e = estadoDelSistema(listo, 0, 3, 10)
    expect(e.paso).toBe('metas')
    expect(e.siguientePaso).toContain('fecha')
  })

  it('con metas pero sin punto de partida, el paso es la línea base', () => {
    expect(estadoDelSistema(listo, 4, 0, 10).paso).toBe('linea-base')
  })

  it('con todo listo pasa a monitoreo y cuenta los días', () => {
    expect(estadoDelSistema(listo, 4, 1, 0).siguientePaso).toContain('Empieza a registrar')
    expect(estadoDelSistema(listo, 4, 1, 1).siguientePaso).toContain('1 día registrado')
    expect(estadoDelSistema(listo, 4, 1, 12).siguientePaso).toContain('12 días registrados')
  })
})
