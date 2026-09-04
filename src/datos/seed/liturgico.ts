import type { EventoLiturgico } from '../../dominio/tipos'

/** Hoja LITURGICO — compromisos fijos y rotativos. */
export const LITURGICO: EventoLiturgico[] = [
  { id: 1, nombre: "Rosario", frecuencia: "Diario", diaHora: "16:55 (antes de salir)", lugar: "Trabajo / camino", nota: "Rosario. Los viernes puedes rezarlo durante la caminata de la mañana." },
  { id: 2, nombre: "Oración de la noche antes de acostarte", frecuencia: "Diario", diaHora: "22:15-23:00", lugar: "Casa", nota: "Oración de la noche antes de acostarte. Examen del día: qué se cumplió y qué no." },
  { id: 3, nombre: "Misa", frecuencia: "Lunes, Jueves, Viernes", diaHora: "18:30-19:30", lugar: "Church SMP", nota: "Misa. Ya en tu calendario. Los lunes de baloncesto, se sustituye por misa dominical reforzada." },
  { id: 4, nombre: "Misa fija de martes", frecuencia: "Cada MARTES", diaHora: "18:30", lugar: "Church SMP", nota: "Misa fija de martes. Innegociable — es el ancla de tu semana." },
  { id: 5, nombre: "Misa vespertina", frecuencia: "Cada SÁBADO", diaHora: "19:00", lugar: "Parroquia", nota: "Misa vespertina. Cumple el precepto dominical." },
  { id: 6, nombre: "Si fuiste el sábado, el domingo queda libre para meal prep y estudio", frecuencia: "Cada DOMINGO", diaHora: "10:30 AM o 12:00 M", lugar: "Parroquia", nota: "Si fuiste el sábado, el domingo queda libre para meal prep y estudio." },
  { id: 7, nombre: "Coincide con tu día de ayuno", frecuencia: "1er VIERNES del mes", diaHora: "Tarde/noche", lugar: "Sagrado Corazón — Noviciado jesuita", nota: "Coincide con tu día de ayuno. Es la combinación ideal: penitencia + devoción." },
  { id: 8, nombre: "Adora y Confía", frecuencia: "2º JUEVES del mes", diaHora: "Por confirmar", lugar: "Centro Bellarmino", nota: "Adora y Confía. Sustituye la misa de Church SMP ese jueves." },
  { id: 9, nombre: "Misa", frecuencia: "2º SÁBADO del mes", diaHora: "19:00", lugar: "San Ramón", nota: "Misa." },
  { id: 10, nombre: "Misa de Jóvenes en Cristo", frecuencia: "3er SÁBADO del mes", diaHora: "19:00", lugar: "San Ramón", nota: "Misa de Jóvenes en Cristo." },
  { id: 11, nombre: "Misa", frecuencia: "3er DOMINGO del mes", diaHora: "10:00 AM", lugar: "San Martín", nota: "Misa. Ese domingo el meal prep se corre a las 15:00." },
  { id: 12, nombre: "AYUNO", frecuencia: "Cada VIERNES", diaHora: "Todo el día", lugar: "—", nota: "AYUNO. Cena del jueves 19:35 → cena del viernes 19:45. Agua, electrolitos, café negro y té sin azúcar." },
]

/** Regla de conflicto, textual: gana el compromiso espiritual. */
export const REGLA_CONFLICTO = [
  "Si un compromiso espiritual choca con entrenamiento: gana el compromiso espiritual. El gym se mueve; la misa no.",
  "Si choca con estudio: gana el compromiso espiritual, y el estudio se recupera el domingo (el bloque del domingo tiene holgura para eso).",
  "Si choca con baloncesto: gana el compromiso espiritual. Por eso el baloncesto del lunes es 3 de 4 semanas y no 4 de 4.",
]
