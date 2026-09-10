/**
 * El briefing: el contrato entre el agente que lo genera y la pantalla que lo lee.
 *
 * Por qué un JSON y no una llamada desde la app: el navegador no puede pedirle
 * nada a CNBC ni a FT — esos sitios no mandan cabeceras CORS y el egreso del
 * contenedor está bloqueado por política de red. Quien sí alcanza esas fuentes
 * es el agente (`.claude/agents/briefing.md`), que corre con búsqueda web,
 * arma este archivo y lo deja servido junto a la app. La pantalla lo lee de su
 * propio origen: sin CORS, y guardado para que funcione sin señal.
 */
import type { FechaISO } from '../tipos'

export type Sesion = 'AM' | 'PM'

/** Un hecho ocurrido y un pronóstico no se escriben igual, ni se leen igual. */
export type TipoPunto = 'HECHO' | 'PRONOSTICO'

export interface Fuente {
  id: number
  medio: string
  titulo: string
  url: string
  /** Cuándo se publicó, según la fuente. */
  fecha: string
}

export interface Cifra {
  nombre: string
  /** Texto, no número: viene tal como la reportó la fuente, sin reinterpretar. */
  valor: string
  cambio: string
  direccion: 'sube' | 'baja' | 'igual'
  /** "cierre del 9 sep 2026". Una cifra sin sello de tiempo es un rumor. */
  comoDe: string
  fuenteId: number
}

export interface Punto {
  titulo: string
  detalle: string
  /** El filtro duro: si no pide nada, el punto no debió entrar. */
  quePide: string
  tipo: TipoPunto
  fuenteId: number
}

export interface Bloque {
  titulo: string
  puntos: Punto[]
}

export interface Decision {
  texto: string
  porQue: string
}

export interface Briefing {
  version: 1
  /** "2026-09-10-am" */
  id: string
  fecha: FechaISO
  sesion: Sesion
  /** ISO 8601 con desfase explícito: "2026-09-10T06:02:00-04:00". */
  generadoEn: string
  mercados: Cifra[]
  bloques: Bloque[]
  /** La síntesis, en palabras del analista. No es el titular repetido. */
  lectura: string[]
  /** Cero a tres. Vacío está bien y es información. */
  decisiones: Decision[]
  fuentes: Fuente[]
  /** Lo que no se pudo traer. Se dice; no se deja el renglón mudo. */
  faltantes: string[]
}

/** Lo que la app guarda: el briefing más cuándo lo bajó ella. */
export interface BriefingGuardado {
  id: string
  briefing: Briefing
  descargadoEn: number
}
