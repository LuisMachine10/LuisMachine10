import { describe, expect, it } from 'vitest'
import { PERFIL_INICIAL } from './metas'
import { PUNTOS_TOTALES, RENGLONES, calcularPuntaje, diagnosticar, estaRegistrado, registroVacio } from './puntaje'
import type { RegistroDiario } from './tipos'

const P = PERFIL_INICIAL

/** Un lunes de entreno perfecto. */
function diaPerfecto(fecha = '2026-09-07'): RegistroDiario {
  return {
    ...registroVacio(fecha, 'ENTRENO'),
    levantar5am: true, camaBulto: true, briefing: true, entrenamiento: true,
    cardio: true, rosario: true, lectura: true, suplementos: true,
    aguaL: 5, estudioMin: 120, suenoH: 6.5,
    proteinaG: 189, kcal: 2750,
  }
}

describe('§4.3 — puntaje diario', () => {
  it('los pesos suman exactamente 100', () => {
    expect(PUNTOS_TOTALES).toBe(100)
    expect(RENGLONES).toHaveLength(13)
  })

  it('un día perfecto da 100', () => {
    const r = calcularPuntaje(diaPerfecto(), P)
    expect(r.puntaje).toBe(100)
    expect(r.pct).toBe(1)
  })

  it('un día sin ningún dato no cuenta: ni 0 ni 100', () => {
    expect(calcularPuntaje(undefined, P).puntaje).toBeNull()
    expect(calcularPuntaje(registroVacio('2026-09-07', 'ENTRENO'), P).puntaje).toBeNull()
    expect(estaRegistrado(registroVacio('2026-09-07', 'ENTRENO'))).toBe(false)
  })

  it('un día cerrado en cero sí cuenta, y cuenta 0', () => {
    const r = calcularPuntaje({ ...registroVacio('2026-09-07', 'ENTRENO'), cerradoEnCero: true }, P)
    expect(r.registrado).toBe(true)
    expect(r.puntaje).toBe(0)
  })

  it('basta un solo toque para que el día quede registrado', () => {
    const r = calcularPuntaje({ ...registroVacio('2026-09-07', 'ENTRENO'), levantar5am: true }, P)
    expect(r.puntaje).toBe(8)
  })

  it('reproduce la fila de ejemplo de la BITACORA: 212 g, 2710 kcal, 5.2 L, 60 min, 6 h, sin lectura', () => {
    // Todo en orden menos lectura (3), estudio (13) y sueño (6): 100 − 22 = 78.
    const r = calcularPuntaje(
      {
        ...diaPerfecto(),
        lectura: false,
        proteinaG: 212, kcal: 2710, aguaL: 5.2, estudioMin: 60, suenoH: 6,
      },
      P,
    )
    expect(r.puntaje).toBe(78)
  })

  it('cada renglón vale exactamente sus puntos', () => {
    for (const def of RENGLONES) {
      const completo = calcularPuntaje(diaPerfecto(), P).puntaje!
      const sinEse = { ...diaPerfecto() }
      if (def.clave === 'proteina') sinEse.proteinaG = 100
      else if (def.clave === 'calorias') sinEse.kcal = 1000
      else if (def.clave === 'agua') sinEse.aguaL = 1
      else if (def.clave === 'estudio') sinEse.estudioMin = 0
      else if (def.clave === 'sueno') sinEse.suenoH = 4
      else (sinEse as Record<string, unknown>)[def.clave] = false
      expect(completo - calcularPuntaje(sinEse, P).puntaje!).toBe(def.puntos)
    }
  })
})

describe('§4.3 — umbrales de nutrición, agua, estudio y sueño', () => {
  const punto = (parche: Partial<RegistroDiario>) =>
    calcularPuntaje({ ...diaPerfecto(), ...parche }, P).renglones

  it('proteína: 189 g cumple, 188 g no', () => {
    expect(punto({ proteinaG: 189 }).find((r) => r.clave === 'proteina')!.cumplido).toBe(true)
    expect(punto({ proteinaG: 188 }).find((r) => r.clave === 'proteina')!.cumplido).toBe(false)
  })

  it('calorías: la tolerancia de ±150 es inclusiva en los dos bordes', () => {
    const cal = (k: number) => punto({ kcal: k }).find((r) => r.clave === 'calorias')!.cumplido
    expect(cal(2600)).toBe(true)
    expect(cal(2900)).toBe(true)
    expect(cal(2599)).toBe(false)
    expect(cal(2901)).toBe(false)
  })

  it('agua 5 L, estudio 120 min y sueño 6.5 h cumplen justo en el umbral', () => {
    expect(punto({ aguaL: 5 }).find((r) => r.clave === 'agua')!.cumplido).toBe(true)
    expect(punto({ aguaL: 4.9 }).find((r) => r.clave === 'agua')!.cumplido).toBe(false)
    expect(punto({ estudioMin: 120 }).find((r) => r.clave === 'estudio')!.cumplido).toBe(true)
    expect(punto({ estudioMin: 119 }).find((r) => r.clave === 'estudio')!.cumplido).toBe(false)
    expect(punto({ suenoH: 6.5 }).find((r) => r.clave === 'sueno')!.cumplido).toBe(true)
    expect(punto({ suenoH: 6.4 }).find((r) => r.clave === 'sueno')!.cumplido).toBe(false)
  })

  it('día de AYUNO: proteína y calorías se juzgan contra el techo de 200 kcal', () => {
    const viernes = (kcal: number | null) =>
      calcularPuntaje(
        { ...registroVacio('2026-09-11', 'AYUNO'), rosario: true, kcal, proteinaG: 0 },
        P,
      ).renglones
    const cumplidos = (kcal: number | null) =>
      viernes(kcal).filter((r) => r.clave === 'proteina' || r.clave === 'calorias').map((r) => r.cumplido)
    expect(cumplidos(0)).toEqual([true, true])
    expect(cumplidos(200)).toEqual([true, true])
    expect(cumplidos(201)).toEqual([false, false])
    // La cena de ruptura del propio menú (≈717 kcal) rompe los dos checks.
    expect(cumplidos(717)).toEqual([false, false])
  })
})

describe('segunda lectura: % sobre lo que el plan sí pedía', () => {
  it('el domingo el plan no pide pesas ni cardio: el denominador baja a 79', () => {
    const domingo: RegistroDiario = {
      ...diaPerfecto('2026-09-13'),
      tipoDia: 'LIGERO',
      entrenamiento: false,
      cardio: false,
      kcal: 2450,
    }
    const r = calcularPuntaje(domingo, P)
    expect(r.puntaje).toBe(79)
    expect(r.posiblesAplicables).toBe(79)
    expect(r.pctAplicable).toBe(1)
    expect(r.pct).toBe(0.79)
  })

  it('el viernes de ayuno no pide pesas, pero sí la caminata (cardio)', () => {
    const viernes: RegistroDiario = {
      ...diaPerfecto('2026-09-11'),
      tipoDia: 'AYUNO',
      entrenamiento: false,
      kcal: 0,
      proteinaG: 0,
    }
    const r = calcularPuntaje(viernes, P)
    expect(r.posiblesAplicables).toBe(85)
    expect(r.puntajeAplicable).toBe(85)
    expect(r.pctAplicable).toBe(1)
  })

  it('si entrenas un día que el plan no lo pedía, el esfuerzo cuenta en las dos lecturas', () => {
    const domingoConPesas: RegistroDiario = {
      ...diaPerfecto('2026-09-13'),
      tipoDia: 'LIGERO',
      cardio: false,
      kcal: 2450,
    }
    const r = calcularPuntaje(domingoConPesas, P)
    expect(r.puntaje).toBe(94)
    expect(r.posiblesAplicables).toBe(94)
    expect(r.pctAplicable).toBe(1)
  })
})

describe('escala de diagnóstico del DASHBOARD', () => {
  it('respeta los cortes 90 / 75 / 50', () => {
    expect(diagnosticar(1)).toBe('Sólido')
    expect(diagnosticar(0.9)).toBe('Sólido')
    expect(diagnosticar(0.899)).toBe('Aceptable')
    expect(diagnosticar(0.75)).toBe('Aceptable')
    expect(diagnosticar(0.749)).toBe('Aquí se está fugando el resultado')
    expect(diagnosticar(0.5)).toBe('Aquí se está fugando el resultado')
    expect(diagnosticar(0.499)).toBe('Renglón crítico')
  })
})
