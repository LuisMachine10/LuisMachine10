import { desdeISO, hoyISO } from './dias'
import type { FechaISO, Perfil } from './tipos'

/** La edad se calcula de la fecha de nacimiento; el número suelto es el respaldo. */
export function edadDe(perfil: Perfil, hoy: FechaISO = hoyISO()): number {
  if (!perfil.fechaNacimiento) return perfil.edad
  const n = desdeISO(perfil.fechaNacimiento)
  const h = desdeISO(hoy)
  let años = h.getFullYear() - n.getFullYear()
  const mes = h.getMonth() - n.getMonth()
  if (mes < 0 || (mes === 0 && h.getDate() < n.getDate())) años -= 1
  return años
}

export interface CampoFaltante {
  campo: keyof Perfil
  etiqueta: string
}

/** Lo mínimo sin lo cual el panel de cálculo no puede producir una meta honesta. */
const OBLIGATORIOS: CampoFaltante[] = [
  { campo: 'nombre', etiqueta: 'Tu nombre' },
  { campo: 'pesoLb', etiqueta: 'Peso' },
  { campo: 'estaturaCm', etiqueta: 'Estatura' },
  { campo: 'pctGrasaEstimado', etiqueta: '% de grasa' },
]

export function camposFaltantes(perfil: Perfil): CampoFaltante[] {
  const faltan = OBLIGATORIOS.filter((c) => {
    const v = perfil[c.campo]
    return typeof v === 'number' ? v <= 0 : !String(v ?? '').trim()
  })
  if (!perfil.fechaNacimiento && perfil.edad <= 0) {
    faltan.push({ campo: 'fechaNacimiento', etiqueta: 'Fecha de nacimiento' })
  }
  return faltan
}

/** Sin estos datos la app no puede calcular nada: no finge, pide. */
export function perfilUsable(perfil: Perfil): boolean {
  return camposFaltantes(perfil).length === 0
}

/**
 * Qué tan lejos está tu sistema de estar montado. No es una racha ni un
 * puntaje: es cuánto falta por llenar.
 */
export interface EstadoDelSistema {
  paso: 'perfil' | 'metas' | 'linea-base' | 'monitoreo'
  perfilListo: boolean
  metasListas: boolean
  lineaBaseLista: boolean
  siguientePaso: string
}

export function estadoDelSistema(
  perfil: Perfil,
  totalMetas: number,
  totalPesajes: number,
  totalDiasRegistrados: number,
): EstadoDelSistema {
  const perfilListo = perfilUsable(perfil) && perfil.completado
  const metasListas = totalMetas > 0
  const lineaBaseLista = totalPesajes > 0
  if (!perfilListo) {
    return {
      paso: 'perfil', perfilListo, metasListas, lineaBaseLista,
      siguientePaso: 'Llena tu información: sin peso, estatura y grasa no hay metas que calcular.',
    }
  }
  if (!metasListas) {
    return {
      paso: 'metas', perfilListo, metasListas, lineaBaseLista,
      siguientePaso: 'Define al menos una meta con fecha. Sin fecha es un deseo, no una meta.',
    }
  }
  if (!lineaBaseLista) {
    return {
      paso: 'linea-base', perfilListo, metasListas, lineaBaseLista,
      siguientePaso: 'Registra tu punto de partida: un pesaje y, si la tienes, la analítica base.',
    }
  }
  return {
    paso: 'monitoreo', perfilListo, metasListas, lineaBaseLista,
    siguientePaso:
      totalDiasRegistrados === 0
        ? 'Todo listo. Empieza a registrar días: el promedio necesita datos, no intenciones.'
        : `Monitoreo andando con ${totalDiasRegistrados} día${totalDiasRegistrados === 1 ? '' : 's'} registrado${totalDiasRegistrados === 1 ? '' : 's'}.`,
  }
}
