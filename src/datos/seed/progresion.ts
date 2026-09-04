import type { CargaSemana } from '../../dominio/tipos'

/** Hoja PROGRESION — 12 semanas de cargas objetivo, calculadas desde los PR reales. */
export const PROGRESION: CargaSemana[] = [
  { semana: 1, bloque: 1, pressBancaTope: "215 lb x 6", bancaBackoff: "3x8 @ 175", remoMaquina: "4.0 x 12", prensaPiernas: "590 x 8", empujeCadera: "155 x 10", rdlHex: "165 x 10", dominadas: "5 x 5", pechadas: "3 x 22", enfoque: "Acumulación. Semana fácil a propósito: estás entrando en déficit." },
  { semana: 2, bloque: 1, pressBancaTope: "225 lb x 5", bancaBackoff: "3x8 @ 185", remoMaquina: "4.5 x 10", prensaPiernas: "640 x 6", empujeCadera: "175 x 10", rdlHex: "185 x 8", dominadas: "5 x 6", pechadas: "3 x 25", enfoque: "Igualas tu PR de banca. Si sale limpio, el déficit está bien calibrado." },
  { semana: 3, bloque: 1, pressBancaTope: "235 lb x 4", bancaBackoff: "3x8 @ 190", remoMaquina: "5.0 x 10", prensaPiernas: "680 x 6", empujeCadera: "195 x 8", rdlHex: "205 x 8", dominadas: "4 x 8", pechadas: "3 x 28", enfoque: "Pico del bloque. RPE 8.5, nunca al fallo." },
  { semana: 4, bloque: 1, pressBancaTope: "185 lb x 5 (2 series)", bancaBackoff: "—", remoMaquina: "3.0 x 12", prensaPiernas: "450 x 10", empujeCadera: "135 x 10", rdlHex: "135 x 10", dominadas: "3 x 5", pechadas: "3 x 20", enfoque: "DELOAD. No lo saltes. Con 4 días de pesas + baloncesto 2x + natación en déficit, esta semana es lo que evita la lesión." },
  { semana: 5, bloque: 2, pressBancaTope: "220 lb x 6", bancaBackoff: "3x8 @ 180", remoMaquina: "4.5 x 12", prensaPiernas: "610 x 8", empujeCadera: "175 x 10", rdlHex: "175 x 10", dominadas: "5 x 6", pechadas: "3 x 30", enfoque: "Reinicio del bloque 5 lb arriba. Primera medición real de si mantienes fuerza." },
  { semana: 6, bloque: 2, pressBancaTope: "230 lb x 5", bancaBackoff: "3x8 @ 190", remoMaquina: "5.0 x 10", prensaPiernas: "660 x 6", empujeCadera: "195 x 10", rdlHex: "195 x 8", dominadas: "5 x 7", pechadas: "3 x 33", enfoque: "Superas el PR en volumen." },
  { semana: 7, bloque: 2, pressBancaTope: "240 lb x 4", bancaBackoff: "3x8 @ 195", remoMaquina: "5.0 x 12", prensaPiernas: "700 x 6", empujeCadera: "215 x 8", rdlHex: "215 x 8", dominadas: "4 x 9", pechadas: "3 x 36", enfoque: "Pico. Si esta semana falla, revisa sueño antes que calorías." },
  { semana: 8, bloque: 2, pressBancaTope: "190 lb x 5 (2 series)", bancaBackoff: "—", remoMaquina: "3.5 x 12", prensaPiernas: "470 x 10", empujeCadera: "145 x 10", rdlHex: "145 x 10", dominadas: "3 x 6", pechadas: "3 x 22", enfoque: "DELOAD + re-medición: pésate, mide cintura, repite fotos." },
  { semana: 9, bloque: 3, pressBancaTope: "225 lb x 6", bancaBackoff: "3x8 @ 185", remoMaquina: "5.0 x 12", prensaPiernas: "630 x 8", empujeCadera: "195 x 10", rdlHex: "185 x 10", dominadas: "5 x 7", pechadas: "3 x 38", enfoque: "Bloque final. Aquí el déficit ya pesa: prioriza la serie tope, recorta accesorios si hace falta." },
  { semana: 10, bloque: 3, pressBancaTope: "235 lb x 5", bancaBackoff: "3x8 @ 195", remoMaquina: "5.5 x 10", prensaPiernas: "680 x 6", empujeCadera: "215 x 10", rdlHex: "205 x 8", dominadas: "5 x 8", pechadas: "3 x 42", enfoque: "PR de volumen en banca: 235x5 supera 225x5." },
  { semana: 11, bloque: 3, pressBancaTope: "245 lb x 4", bancaBackoff: "3x8 @ 200", remoMaquina: "5.5 x 12", prensaPiernas: "720 x 6", empujeCadera: "235 x 8", rdlHex: "225 x 8", dominadas: "4 x 10", pechadas: "3 x 45", enfoque: "Pico del ciclo." },
  { semana: 12, bloque: 3, pressBancaTope: "DELOAD + retest", bancaBackoff: "—", remoMaquina: "4.0 x 12", prensaPiernas: "490 x 10", empujeCadera: "155 x 10", rdlHex: "155 x 10", dominadas: "Test máximo", pechadas: "Test 50 reps", enfoque: "Semana de prueba: banca a 5 reps máximo, dominadas al máximo, pechadas a 50. Y perfil lipídico de control." },
]

export interface PrDeclarado { levantamiento: string; pr: string; rm1Estimado: string; nota: string }

/** PR declarados el 03/09/2026 — la base de toda la progresión. */
export const PR_DECLARADOS: PrDeclarado[] = [
  { levantamiento: "Press de banca", pr: "225 lb x 5", rm1Estimado: "260", nota: "Epley. Tu serie de trabajo 4-6 reps vive entre 215 y 240 lb." },
  { levantamiento: "Peso muerto convencional", pr: "315 lb x 3", rm1Estimado: "340", nota: "CONDICIONAL — con hernias discales requiere autorización. La progresión de abajo usa RDL con barra hexagonal o mancuernas." },
  { levantamiento: "Remo en máquina", pr: "5 discos/lado x 12", rm1Estimado: "—", nota: "Tu 12RM. Es tu ancla de tracción horizontal." },
  { levantamiento: "Prensa de piernas", pr: "800 lb", rm1Estimado: "—", nota: "Tu ancla de pierna, en sustitución de la sentadilla." },
  { levantamiento: "Extensión de cuádriceps", pr: "210 lb (stack completo)", rm1Estimado: "—", nota: "Ya lo maxeas: la progresión ahora es por tempo y pausa, no por peso." },
  { levantamiento: "Dominadas", pr: "10-12 máx / 5-8 habitual", rm1Estimado: "—", nota: "Objetivo semana 12: 4x10 limpias o 5 reps con +25 lb." },
  { levantamiento: "Pechadas", pr: "50 máx / 20-25 habitual", rm1Estimado: "—", nota: "Objetivo semana 12: volver a 50 en una serie." },
  { levantamiento: "Press militar de pie", pr: "PENDIENTE", rm1Estimado: "—", nota: "Anótalo la primera semana y te recalculo el bloque de hombro." },
]
