/**
 * Tipos del dominio. Todo lo que vive aquí es el vocabulario del Excel
 * "Sistema Mena v2.0" traducido a TypeScript: mismos nombres, mismas unidades.
 */

/** Fecha local en formato ISO corto: "2026-09-07". Nunca un Date con hora. */
export type FechaISO = string

export type TipoDia = 'ENTRENO' | 'LIGERO' | 'AYUNO'

/** 1 = lunes … 7 = domingo (ISO-8601). */
export type DiaSemana = 1 | 2 | 3 | 4 | 5 | 6 | 7

export interface Perfil {
  id: 'perfil'
  pesoLb: number
  estaturaCm: number
  edad: number
  pctGrasaEstimado: number
  factorActividad: number
  deficitEntreno: number
  deficitLigero: number
  /** Metas de hábito, todas editables. Vienen de la hoja NUTRICION. */
  aguaMetaL: number
  estudioMetaMin: number
  suenoMetaH: number
  toleranciaKcal: number
  /** kcal máximas para que un día de AYUNO siga contando como ayuno. */
  techoKcalAyuno: number
}

/** Resultado del panel de cálculo (hoja NUTRICION), con su trazabilidad. */
export interface MetasDiarias {
  pesoKg: number
  masaMagraKg: number
  tmb: number
  tdee: number
  kcalEntreno: number
  kcalLigero: number
  kcalAyuno: number
  proteinaG: number
  grasaG: number
  carbsEntrenoG: number
  carbsLigeroG: number
}

/** Meta del día concreto, ya resuelta por tipo de día. */
export interface MetaDelDia {
  tipoDia: TipoDia
  kcal: number
  proteinaG: number
  grasaG: number
  carbsG: number
  aguaL: number
  estudioMin: number
  suenoH: number
}

export type EstadoAlimento = 'crudo' | 'seco' | 'cocidas' | 'polvo' | 'líquido' | '—'

export interface Alimento {
  id: number
  nombre: string
  estado: EstadoAlimento
  kcal100g: number
  prot100g: number
  carb100g: number
  grasa100g: number
  medidaComun: string
  gramosPorMedida: number
  nota: string
  favorito: boolean
}

export type TipoComida = 'desayuno' | 'almuerzo' | 'merienda' | 'cena'

export interface ItemComida {
  alimentoId: number
  gramos: number
}

export interface Comida {
  id?: number
  fecha: FechaISO
  tipo: TipoComida
  items: ItemComida[]
}

export interface MenuGuardado {
  id: number
  nombre: string
  tipoDia: TipoDia
  tipo: TipoComida
  items: ItemComida[]
  nota: string
}

export interface Ejercicio {
  id: number
  nombre: string
  dia: 1 | 2 | 3 | 4
  orden: number
  seriesPlan: number | null
  repsPlan: string
  rpePlan: number | null
  descansoSeg: number | null
  notaTecnica: string
  esAncla: boolean
  restriccion: string | null
  claveProgresion: string | null
}

export interface SerieRegistrada {
  ejercicioId: number
  setNum: number
  pesoLb: number | null
  reps: number | null
  rpe: number | null
  completada: boolean
}

export interface SesionGym {
  id?: number
  fecha: FechaISO
  diaSplit: 1 | 2 | 3 | 4
  duracionMin: number | null
  series: SerieRegistrada[]
}

/** Una fila de la hoja BITACORA. */
export interface RegistroDiario {
  fecha: FechaISO
  tipoDia: TipoDia
  levantar5am: boolean
  camaBulto: boolean
  briefing: boolean
  entrenamiento: boolean
  cardio: boolean
  rosario: boolean
  lectura: boolean
  suplementos: boolean
  aguaL: number | null
  estudioMin: number | null
  suenoH: number | null
  /**
   * Fase 1: se escriben a mano (como en la BITACORA).
   * Fase 2: si hay comidas registradas ese día, el valor calculado manda
   * y estos campos pasan a ser de solo lectura.
   */
  proteinaG: number | null
  kcal: number | null
  carbG: number | null
  grasaG: number | null
  notas: string
  /** El usuario decidió cerrar el día en cero: cuenta en los promedios como 0. */
  cerradoEnCero?: boolean
  actualizadoEn: number
}

export interface Peso {
  fecha: FechaISO
  pesoLb: number
  pctGrasa: number | null
  cinturaCm: number | null
  notas: string
}

export interface Analitica {
  fecha: FechaISO
  colTotal: number | null
  ldl: number | null
  hdl: number | null
  trigliceridos: number | null
  alt: number | null
  ast: number | null
  notas: string
}

export interface EventoLiturgico {
  id: number
  nombre: string
  frecuencia: string
  diaHora: string
  lugar: string
  nota: string
}

export interface BloqueHorario {
  id: number
  dia: DiaSemana
  hora: string
  actividad: string
  detalle: string
  bloque: string
}

export interface CargaSemana {
  semana: number
  bloque: number
  pressBancaTope: string
  bancaBackoff: string
  remoMaquina: string
  prensaPiernas: string
  empujeCadera: string
  rdlHex: string
  dominadas: string
  pechadas: string
  enfoque: string
}
