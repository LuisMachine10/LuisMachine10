import { diaSemana, diaSplit } from './dias'
import { metaDelDia } from './metas'
import type { FechaISO, Perfil, RegistroDiario, TipoDia } from './tipos'

export type Categoria =
  | 'DISCIPLINA BASE'
  | 'ENTRENAMIENTO'
  | 'NUTRICIÓN'
  | 'VIDA ESPIRITUAL'
  | 'CAPITAL HUMANO'
  | 'RECUPERACIÓN'

export const CATEGORIAS: Categoria[] = [
  'DISCIPLINA BASE',
  'ENTRENAMIENTO',
  'NUTRICIÓN',
  'VIDA ESPIRITUAL',
  'CAPITAL HUMANO',
  'RECUPERACIÓN',
]

export type ClaveToggle =
  | 'levantar5am'
  | 'camaBulto'
  | 'briefing'
  | 'entrenamiento'
  | 'cardio'
  | 'rosario'
  | 'lectura'
  | 'suplementos'

export type ClaveRenglon = ClaveToggle | 'proteina' | 'calorias' | 'agua' | 'estudio' | 'sueno'

interface DefRenglon {
  clave: ClaveRenglon
  etiqueta: string
  puntos: number
  categoria: Categoria
  esToggle: boolean
}

/** §4.3 — 100 puntos exactos. Los pesos son los de la fila 2 de la BITACORA. */
export const RENGLONES: DefRenglon[] = [
  { clave: 'levantar5am', etiqueta: 'Levantarse 5:00', puntos: 8, categoria: 'DISCIPLINA BASE', esToggle: true },
  { clave: 'camaBulto', etiqueta: 'Cama + bulto', puntos: 4, categoria: 'DISCIPLINA BASE', esToggle: true },
  { clave: 'briefing', etiqueta: 'Briefing de mercado', puntos: 6, categoria: 'DISCIPLINA BASE', esToggle: true },
  { clave: 'entrenamiento', etiqueta: 'Entrenamiento', puntos: 15, categoria: 'ENTRENAMIENTO', esToggle: true },
  { clave: 'cardio', etiqueta: 'Cardio 30 min', puntos: 6, categoria: 'ENTRENAMIENTO', esToggle: true },
  { clave: 'rosario', etiqueta: 'Rosario', puntos: 6, categoria: 'VIDA ESPIRITUAL', esToggle: true },
  { clave: 'lectura', etiqueta: 'Lectura 20 min', puntos: 3, categoria: 'CAPITAL HUMANO', esToggle: true },
  { clave: 'suplementos', etiqueta: 'Suplementos', puntos: 3, categoria: 'NUTRICIÓN', esToggle: true },
  { clave: 'proteina', etiqueta: 'Proteína', puntos: 12, categoria: 'NUTRICIÓN', esToggle: false },
  { clave: 'calorias', etiqueta: 'Calorías', puntos: 10, categoria: 'NUTRICIÓN', esToggle: false },
  { clave: 'agua', etiqueta: 'Agua', puntos: 8, categoria: 'NUTRICIÓN', esToggle: false },
  { clave: 'estudio', etiqueta: 'Estudio', puntos: 13, categoria: 'CAPITAL HUMANO', esToggle: false },
  { clave: 'sueno', etiqueta: 'Sueño', puntos: 6, categoria: 'RECUPERACIÓN', esToggle: false },
]

export const PUNTOS_TOTALES = RENGLONES.reduce((s, r) => s + r.puntos, 0)

export interface RenglonPuntaje {
  clave: ClaveRenglon
  etiqueta: string
  puntos: number
  categoria: Categoria
  cumplido: boolean
  /** El plan pedía esto ese día. Un domingo no pide pesas ni cardio. */
  aplica: boolean
  detalle: string
}

export interface ResultadoPuntaje {
  registrado: boolean
  /** Puntaje crudo 0-100, idéntico a la fórmula de la BITACORA. null si el día no está registrado. */
  puntaje: number | null
  pct: number | null
  /** Segunda lectura: puntos logrados sobre lo que el plan sí pedía ese día. */
  puntajeAplicable: number | null
  posiblesAplicables: number
  pctAplicable: number | null
  renglones: RenglonPuntaje[]
}

export function registroVacio(fecha: FechaISO, tipoDia: TipoDia): RegistroDiario {
  return {
    fecha,
    tipoDia,
    levantar5am: false,
    camaBulto: false,
    briefing: false,
    entrenamiento: false,
    cardio: false,
    rosario: false,
    lectura: false,
    suplementos: false,
    aguaL: null,
    estudioMin: null,
    suenoH: null,
    proteinaG: null,
    kcal: null,
    carbG: null,
    grasaG: null,
    notas: '',
    actualizadoEn: Date.now(),
  }
}

/**
 * Un día sin ningún dato no cuenta en los promedios: ni como 0 ni como 100.
 * No es lo mismo un día malo que un día no registrado.
 */
export function estaRegistrado(r: RegistroDiario | undefined | null): boolean {
  if (!r) return false
  if (r.cerradoEnCero) return true
  const toggles: ClaveToggle[] = [
    'levantar5am', 'camaBulto', 'briefing', 'entrenamiento',
    'cardio', 'rosario', 'lectura', 'suplementos',
  ]
  if (toggles.some((t) => r[t])) return true
  const numeros = [r.aguaL, r.estudioMin, r.suenoH, r.proteinaG, r.kcal]
  return numeros.some((n) => n !== null && n !== undefined)
}

/** §4.5 — el split decide qué pedía el plan ese día. */
function aplicaEseDia(clave: ClaveRenglon, fecha: FechaISO, tipoDia: TipoDia): boolean {
  if (clave === 'entrenamiento') return diaSplit(fecha) !== null && tipoDia !== 'AYUNO'
  if (clave === 'cardio') return diaSemana(fecha) !== 7
  return true
}

const num = (n: number | null | undefined): number => (n === null || n === undefined ? 0 : n)
const g = (n: number) => n.toLocaleString('es-DO', { maximumFractionDigits: 0 })

export function calcularPuntaje(registro: RegistroDiario | undefined | null, perfil: Perfil): ResultadoPuntaje {
  const registrado = estaRegistrado(registro)
  const tipoDia = registro?.tipoDia ?? 'ENTRENO'
  const fecha = registro?.fecha ?? '1970-01-01'
  const meta = metaDelDia(perfil, tipoDia)
  const esAyuno = tipoDia === 'AYUNO'
  const kcal = num(registro?.kcal)
  const prot = num(registro?.proteinaG)

  const renglones: RenglonPuntaje[] = RENGLONES.map((def) => {
    let cumplido = false
    let detalle = ''

    if (def.esToggle) {
      cumplido = registro ? Boolean(registro[def.clave as ClaveToggle]) : false
    } else if (def.clave === 'proteina') {
      cumplido = esAyuno ? kcal <= perfil.techoKcalAyuno : prot >= meta.proteinaG
      detalle = esAyuno
        ? `Ayuno: ${g(kcal)} kcal, techo ${g(perfil.techoKcalAyuno)}`
        : `${g(prot)} g de ${g(meta.proteinaG)} g`
    } else if (def.clave === 'calorias') {
      cumplido = esAyuno ? kcal <= perfil.techoKcalAyuno : Math.abs(kcal - meta.kcal) <= perfil.toleranciaKcal
      detalle = esAyuno
        ? `Ayuno: ${g(kcal)} kcal, techo ${g(perfil.techoKcalAyuno)}`
        : `${g(kcal)} kcal · meta ${g(meta.kcal)} ± ${g(perfil.toleranciaKcal)}`
    } else if (def.clave === 'agua') {
      cumplido = num(registro?.aguaL) >= meta.aguaL
      detalle = `${num(registro?.aguaL).toLocaleString('es-DO', { maximumFractionDigits: 1 })} L de ${meta.aguaL} L`
    } else if (def.clave === 'estudio') {
      cumplido = num(registro?.estudioMin) >= meta.estudioMin
      detalle = `${g(num(registro?.estudioMin))} min de ${g(meta.estudioMin)} min`
    } else if (def.clave === 'sueno') {
      cumplido = num(registro?.suenoH) >= meta.suenoH
      detalle = `${num(registro?.suenoH).toLocaleString('es-DO', { maximumFractionDigits: 1 })} h de ${meta.suenoH} h`
    }

    if (!registrado) cumplido = false
    // Si el plan no lo pedía pero lo hiciste igual, cuenta: entra en las dos lecturas.
    const aplica = aplicaEseDia(def.clave, fecha, tipoDia) || cumplido

    return { clave: def.clave, etiqueta: def.etiqueta, puntos: def.puntos, categoria: def.categoria, cumplido, aplica, detalle }
  })

  const puntaje = renglones.reduce((s, r) => s + (r.cumplido ? r.puntos : 0), 0)
  const posiblesAplicables = renglones.reduce((s, r) => s + (r.aplica ? r.puntos : 0), 0)
  const puntajeAplicable = renglones.reduce((s, r) => s + (r.aplica && r.cumplido ? r.puntos : 0), 0)

  return {
    registrado,
    puntaje: registrado ? puntaje : null,
    pct: registrado ? puntaje / PUNTOS_TOTALES : null,
    puntajeAplicable: registrado ? puntajeAplicable : null,
    posiblesAplicables,
    pctAplicable: registrado && posiblesAplicables > 0 ? puntajeAplicable / posiblesAplicables : null,
    renglones,
  }
}

export type Diagnostico = 'Sólido' | 'Aceptable' | 'Aquí se está fugando el resultado' | 'Renglón crítico'

/** Escala del DASHBOARD. */
export function diagnosticar(adherencia: number): Diagnostico {
  if (adherencia >= 0.9) return 'Sólido'
  if (adherencia >= 0.75) return 'Aceptable'
  if (adherencia >= 0.5) return 'Aquí se está fugando el resultado'
  return 'Renglón crítico'
}
