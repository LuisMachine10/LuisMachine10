import { CATEGORIAS, calcularPuntaje, diagnosticar, RENGLONES } from './puntaje'
import type { Categoria, Diagnostico } from './puntaje'
import type { Perfil, RegistroDiario } from './tipos'

export interface ResumenPeriodo {
  diasRegistrados: number
  diasEnPeriodo: number
  puntajePromedio: number | null
  pctPromedio: number | null
  pctAplicablePromedio: number | null
  diasSobre80: number
  diasBajo60: number
}

/**
 * La métrica es el promedio, no el día suelto. Los días no registrados
 * se excluyen del cálculo: no ensucian el promedio con ceros falsos.
 */
export function resumirPeriodo(registros: RegistroDiario[], perfil: Perfil): ResumenPeriodo {
  const puntajes = registros
    .map((r) => calcularPuntaje(r, perfil))
    .filter((p) => p.registrado)

  if (puntajes.length === 0) {
    return {
      diasRegistrados: 0,
      diasEnPeriodo: registros.length,
      puntajePromedio: null,
      pctPromedio: null,
      pctAplicablePromedio: null,
      diasSobre80: 0,
      diasBajo60: 0,
    }
  }

  const suma = puntajes.reduce((s, p) => s + (p.puntaje ?? 0), 0)
  const sumaAplicable = puntajes.reduce((s, p) => s + (p.pctAplicable ?? 0), 0)
  return {
    diasRegistrados: puntajes.length,
    diasEnPeriodo: registros.length,
    puntajePromedio: suma / puntajes.length,
    pctPromedio: suma / puntajes.length / 100,
    pctAplicablePromedio: sumaAplicable / puntajes.length,
    diasSobre80: puntajes.filter((p) => (p.puntaje ?? 0) >= 80).length,
    diasBajo60: puntajes.filter((p) => (p.puntaje ?? 0) < 60).length,
  }
}

export interface RenglonEstado {
  etiqueta: string
  categoria: Categoria
  logrados: number
  posibles: number
  adherencia: number | null
  diagnostico: Diagnostico | null
}

export interface CategoriaEstado {
  categoria: Categoria
  renglones: RenglonEstado[]
  logrados: number
  posibles: number
  adherencia: number | null
  diagnostico: Diagnostico | null
}

export interface EstadoDeResultados {
  categorias: CategoriaEstado[]
  logrados: number
  posibles: number
  margen: number | null
  diagnostico: Diagnostico | null
}

/**
 * El P&L de la disciplina. `usarAplicables` cambia el denominador:
 * false = puntos posibles del Excel (100/día), true = solo lo que el plan pedía.
 */
export function estadoDeResultados(
  registros: RegistroDiario[],
  perfil: Perfil,
  usarAplicables = false,
): EstadoDeResultados {
  const evaluados = registros.map((r) => calcularPuntaje(r, perfil)).filter((p) => p.registrado)

  const porClave = new Map<string, { logrados: number; posibles: number }>()
  for (const def of RENGLONES) porClave.set(def.clave, { logrados: 0, posibles: 0 })

  for (const dia of evaluados) {
    for (const r of dia.renglones) {
      const acc = porClave.get(r.clave)!
      if (usarAplicables && !r.aplica) continue
      acc.posibles += r.puntos
      if (r.cumplido) acc.logrados += r.puntos
    }
  }

  const categorias: CategoriaEstado[] = CATEGORIAS.map((categoria) => {
    const renglones: RenglonEstado[] = RENGLONES.filter((d) => d.categoria === categoria).map((def) => {
      const acc = porClave.get(def.clave)!
      const adherencia = acc.posibles > 0 ? acc.logrados / acc.posibles : null
      return {
        etiqueta: def.etiqueta,
        categoria,
        logrados: acc.logrados,
        posibles: acc.posibles,
        adherencia,
        diagnostico: adherencia === null ? null : diagnosticar(adherencia),
      }
    })
    const logrados = renglones.reduce((s, r) => s + r.logrados, 0)
    const posibles = renglones.reduce((s, r) => s + r.posibles, 0)
    const adherencia = posibles > 0 ? logrados / posibles : null
    return {
      categoria,
      renglones,
      logrados,
      posibles,
      adherencia,
      diagnostico: adherencia === null ? null : diagnosticar(adherencia),
    }
  })

  const logrados = categorias.reduce((s, c) => s + c.logrados, 0)
  const posibles = categorias.reduce((s, c) => s + c.posibles, 0)
  const margen = posibles > 0 ? logrados / posibles : null
  return {
    categorias,
    logrados,
    posibles,
    margen,
    diagnostico: margen === null ? null : diagnosticar(margen),
  }
}

/** Media móvil de N registros: la línea gruesa. El punto suelto es ruido. */
export function mediaMovil(valores: (number | null)[], ventana = 4): (number | null)[] {
  return valores.map((_, i) => {
    if (i + 1 < ventana) return null
    const trozo = valores.slice(i + 1 - ventana, i + 1)
    if (trozo.some((v) => v === null || v === undefined)) return null
    return (trozo as number[]).reduce((s, v) => s + v, 0) / ventana
  })
}
