/**
 * §4.6 — Bloqueo duro. Hernias discales + meniscos deteriorados.
 * La app nunca sugiere ni autocompleta estos movimientos, y si el usuario
 * escribe uno, explica por qué y ofrece la alternativa. Nunca en silencio.
 */
export interface Prohibido {
  patron: string
  nombre: string
  motivo: string
  alternativa: string
}

export const PROHIBIDOS: Prohibido[] = [
  {
    patron: 'sentadilla con barra',
    nombre: 'Sentadilla con barra',
    motivo: 'Compresión axial sobre discos herniados.',
    alternativa: 'Prensa de piernas (ya mueves 800 lb) o hack en máquina.',
  },
  {
    patron: 'saltos al cajon',
    nombre: 'Saltos al cajón',
    motivo: 'Impacto repetido sobre meniscos deteriorados.',
    alternativa: 'Empuje de cadera o step-up controlado sin fase de vuelo.',
  },
  {
    patron: 'salto amplio',
    nombre: 'Salto amplio',
    motivo: 'Aterrizaje de alta carga sobre la rodilla.',
    alternativa: 'Empuje de cadera con barra.',
  },
  {
    patron: 'pliometria',
    nombre: 'Pliometría',
    motivo: 'Todo el bloque de saltos es lo contrario de lo que tu rodilla necesita.',
    alternativa: 'Prensa, empuje de cadera y trabajo de máquina.',
  },
  {
    patron: 'rueda abdominal',
    nombre: 'Rueda abdominal',
    motivo: 'Carga el disco en extensión bajo tensión.',
    alternativa: 'Press Pallof en polea.',
  },
  {
    patron: 'crunch en polea',
    nombre: 'Crunch en polea',
    motivo: 'Flexión lumbar cargada.',
    alternativa: 'Dead bug con banda.',
  },
  {
    patron: 'lenador en polea',
    nombre: 'Leñador en polea',
    motivo: 'Rotación lumbar bajo carga.',
    alternativa: 'Press Pallof (anti-rotación) o paseo maleta.',
  },
  {
    patron: 'remo con barra inclinado',
    nombre: 'Remo con barra inclinado',
    motivo: 'Sostiene flexión de cadera con carga sobre el erector lumbar.',
    alternativa: 'Remo en máquina con pecho apoyado (tu ancla: 5 discos/lado × 12).',
  },
  {
    patron: 'peso muerto convencional',
    nombre: 'Peso muerto convencional',
    motivo: 'Requiere autorización médica con hernias discales.',
    alternativa: 'RDL con barra hexagonal o mancuernas — marcado CONDICIONAL en el plan.',
  },
]

/** Quita tildes y normaliza para comparar sin depender de cómo se escribió. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Devuelve la restricción si el texto escrito coincide con un movimiento prohibido. */
export function revisarRestriccion(texto: string): Prohibido | null {
  const t = normalizar(texto)
  if (!t) return null
  return PROHIBIDOS.find((p) => t.includes(p.patron) || p.patron.includes(t)) ?? null
}
