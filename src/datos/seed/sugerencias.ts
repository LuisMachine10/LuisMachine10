import { sumarDias } from '../../dominio/dias'
import type { CondicionSalud, Ejercicio, FechaISO, MetaPersonal } from '../../dominio/tipos'

/** Una sugerencia todavía no es tuya: la adoptas o la descartas. */
export type MetaSugerida = Omit<MetaPersonal, 'id' | 'creadaEn'> & { clave: string; porque: string }

const SEMANAS_12 = 83

/**
 * Metas propuestas a partir del Excel. Cada una dice de dónde salió, para que
 * puedas discutirla en vez de aceptarla porque sí.
 */
export function metasSugeridas(inicio: FechaISO, ejercicios: Ejercicio[]): MetaSugerida[] {
  const fin = sumarDias(inicio, SEMANAS_12)
  const mes1 = sumarDias(inicio, 30)
  const idDe = (frag: string) => ejercicios.find((e) => e.nombre.includes(frag))?.id ?? null
  const banca = idDe('Press de banca')
  const prensa = idDe('Prensa de piernas')

  const base = { valorManual: null, fechaInicio: inicio, estado: 'activa' as const, nota: '' }

  const lista: MetaSugerida[] = [
    {
      ...base, clave: 'peso',
      area: 'COMPOSICIÓN', nombre: 'Bajar a 204 lb (92.5 kg)', tipo: 'numerica', fuente: 'peso',
      valorInicial: 220, valorMeta: 204, unidad: 'lb', direccion: 'bajar', fechaLimite: fin,
      porque: 'Hoja PESO: “bajar de ~99.8 kg a ~91-93 kg en 12 semanas”.',
    },
    {
      ...base, clave: 'masaMuscular',
      area: 'COMPOSICIÓN', nombre: 'No bajar de 43.6 kg de masa muscular', tipo: 'numerica', fuente: 'manual',
      valorInicial: 43.6, valorMeta: 43.6, unidad: 'kg', direccion: 'subir', fechaLimite: fin,
      porque: 'InBody 12/05/2025. Toda la pérdida debe venir de grasa; esto se mide con otro InBody.',
    },
    {
      ...base, clave: 'ldl',
      area: 'SALUD', nombre: 'LDL por debajo de 100', tipo: 'numerica', fuente: 'analitica:ldl',
      valorInicial: null, valorMeta: 100, unidad: 'mg/dL', direccion: 'bajar', fechaLimite: fin,
      porque: 'El reto de la rosuvastatina. Sin el panel base esta meta no se puede medir.',
    },
    {
      ...base, clave: 'trigliceridos',
      area: 'SALUD', nombre: 'Triglicéridos por debajo de 150', tipo: 'numerica', fuente: 'analitica:trigliceridos',
      valorInicial: null, valorMeta: 150, unidad: 'mg/dL', direccion: 'bajar', fechaLimite: fin,
      porque: 'Referencia general de la hoja PESO.',
    },
    {
      ...base, clave: 'panelBase',
      area: 'SALUD', nombre: 'Hacer el perfil lipídico base esta semana', tipo: 'hito', fuente: 'manual',
      valorInicial: null, valorMeta: null, unidad: '', direccion: 'subir',
      fechaLimite: sumarDias(inicio, 7),
      porque: 'Es el dato base. Sin él, dejar la estatina no es un experimento, es una apuesta.',
    },
    {
      ...base, clave: 'hablarMedico',
      area: 'SALUD', nombre: 'Avisarle al médico que prescribió la rosuvastatina', tipo: 'hito', fuente: 'manual',
      valorInicial: null, valorMeta: null, unidad: '', direccion: 'subir',
      fechaLimite: sumarDias(inicio, 14),
      porque: 'Dejarlo en silencio te quita la única red de seguridad que tienes.',
    },
    {
      ...base, clave: 'banca',
      area: 'ENTRENAMIENTO', nombre: 'Press de banca 245 lb', tipo: 'numerica',
      fuente: banca ? (`ejercicio:${banca}` as const) : 'manual',
      valorInicial: 225, valorMeta: 245, unidad: 'lb', direccion: 'subir', fechaLimite: fin,
      porque: 'Hoja PROGRESION, semana 11: 245 lb × 4.',
    },
    {
      ...base, clave: 'prensa',
      area: 'ENTRENAMIENTO', nombre: 'Prensa de piernas 720 lb', tipo: 'numerica',
      fuente: prensa ? (`ejercicio:${prensa}` as const) : 'manual',
      valorInicial: 590, valorMeta: 720, unidad: 'lb', direccion: 'subir', fechaLimite: fin,
      porque: 'Hoja PROGRESION, semana 11. Tu ancla de pierna en lugar de la sentadilla.',
    },
    {
      ...base, clave: 'dominadas',
      area: 'ENTRENAMIENTO', nombre: 'Dominadas 4×10 limpias', tipo: 'hito', fuente: 'manual',
      valorInicial: null, valorMeta: null, unidad: '', direccion: 'subir', fechaLimite: fin,
      porque: 'Objetivo de semana 12 en PROGRESION: 4×10 limpias o 5 reps con +25 lb.',
    },
    {
      ...base, clave: 'pechadas',
      area: 'ENTRENAMIENTO', nombre: 'Volver a 50 pechadas en una serie', tipo: 'numerica', fuente: 'manual',
      valorInicial: 25, valorMeta: 50, unidad: 'reps', direccion: 'subir', fechaLimite: fin,
      porque: 'Objetivo de semana 12 en PROGRESION.',
    },
    {
      ...base, clave: 'pressMilitar',
      area: 'ENTRENAMIENTO', nombre: 'Anotar el PR de press militar de pie', tipo: 'hito', fuente: 'manual',
      valorInicial: null, valorMeta: null, unidad: '', direccion: 'subir',
      fechaLimite: sumarDias(inicio, 7),
      porque: 'Es el único levantamiento ancla sin PR declarado. Sin él no hay progresión de hombro.',
    },
    {
      ...base, clave: 'margenMes1',
      area: 'DISCIPLINA BASE', nombre: 'Margen de cumplimiento en 75% el primer mes', tipo: 'numerica',
      fuente: 'margenCumplimiento',
      valorInicial: 0, valorMeta: 75, unidad: '%', direccion: 'subir', fechaLimite: mes1,
      porque: 'DASHBOARD: “75% el primer mes, 85% el segundo, 90% el tercero”.',
    },
    {
      ...base, clave: 'sueno',
      area: 'RECUPERACIÓN', nombre: 'Promedio de sueño en 6.5 h', tipo: 'numerica', fuente: 'promedioSuenoH',
      valorInicial: null, valorMeta: 6.5, unidad: 'h', direccion: 'subir', fechaLimite: fin,
      porque: 'Es el renglón que más caro cuesta sacrificar, según el propio DASHBOARD.',
    },
    {
      ...base, clave: 'estudio',
      area: 'CAPITAL HUMANO', nombre: 'Promedio de estudio en 120 min', tipo: 'numerica',
      fuente: 'promedioEstudioMin',
      valorInicial: null, valorMeta: 120, unidad: 'min', direccion: 'subir', fechaLimite: fin,
      porque: 'Meta diaria de la hoja NUTRICION, medida como promedio y no día por día.',
    },
    {
      ...base, clave: 'fmva',
      area: 'CARRERA', nombre: 'Aprobar la certificación CFI-FMVA', tipo: 'hito', fuente: 'manual',
      valorInicial: null, valorMeta: null, unidad: '', direccion: 'subir', fechaLimite: null,
      porque: 'Es a lo que dedicas el bloque de estudio entre semana.',
    },
    {
      ...base, clave: 'simv',
      area: 'CARRERA', nombre: 'Aprobar Corredor de Valores del SIMV', tipo: 'hito', fuente: 'manual',
      valorInicial: null, valorMeta: null, unidad: '', direccion: 'subir', fechaLimite: null,
      porque: 'Tiene prioridad los fines de semana según tu horario.',
    },
  ]
  return lista
}

/** Condiciones que el Excel menciona. También son sugerencias: las confirmas tú. */
export const CONDICIONES_SUGERIDAS: (Omit<CondicionSalud, 'id'> & { porque: string })[] = [
  {
    nombre: 'Hernias discales',
    detalle: 'Sin compresión axial ni flexión lumbar cargada. De aquí salen los bloqueos de movimiento.',
    activa: true, desde: null,
    porque: 'Hoja LEEME: por esto se eliminó toda la sentadilla y toda la flexión lumbar cargada.',
  },
  {
    nombre: 'Meniscos deteriorados',
    detalle: 'Sin saltos ni pliometría. Prensa y máquinas dan el mismo estímulo sin cizallar la rodilla.',
    activa: true, desde: null,
    porque: 'Hoja LEEME: por esto se eliminó el bloque de saltos de la v1.0.',
  },
  {
    nombre: 'Dislipidemia en tratamiento con rosuvastatina',
    detalle: 'En proceso de dejarla por dieta y ejercicio, con panel lipídico de control.',
    activa: true, desde: null,
    porque: 'Hoja LEEME: la tomas desde los 18 años y quieres dejarla. Requiere panel base y aviso al médico.',
  },
  {
    nombre: 'Esteatosis hepática',
    detalle: 'ALT y AST son el indicador de si el corte está funcionando en el hígado.',
    activa: true, desde: null,
    porque: 'Hoja PESO: “Con esteatosis hepática, ALT y AST son el indicador”.',
  },
]
