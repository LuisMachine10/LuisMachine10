import type { MenuGuardado } from '../../dominio/tipos'

/**
 * Hoja MENUS — los tres días modelo con sus gramos exactos.
 * Cargar uno de estos es lo que hace que registrar una comida tome 10 segundos.
 */
export const MENUS: MenuGuardado[] = [
  {
    id: 1, nombre: "Desayuno día entreno", tipoDia: "ENTRENO", tipo: "desayuno",
    items: [{ alimentoId: 10, gramos: 150 }, { alimentoId: 11, gramos: 200 }, { alimentoId: 19, gramos: 90 }, { alimentoId: 33, gramos: 150 }, { alimentoId: 27, gramos: 16 }],
    nota: "3 huevos + 6 claras. Avena pesada SECA.",
  },
  {
    id: 2, nombre: "Almuerzo día entreno", tipoDia: "ENTRENO", tipo: "almuerzo",
    items: [{ alimentoId: 1, gramos: 250 }, { alimentoId: 16, gramos: 130 }, { alimentoId: 25, gramos: 60 }, { alimentoId: 39, gramos: 150 }, { alimentoId: 26, gramos: 7 }],
    nota: "Pollo CRUDO, arroz SECO.",
  },
  {
    id: 3, nombre: "Merienda día entreno", tipoDia: "ENTRENO", tipo: "merienda",
    items: [{ alimentoId: 12, gramos: 30 }, { alimentoId: 20, gramos: 56 }, { alimentoId: 34, gramos: 100 }],
    nota: "1 scoop + 2 rebanadas.",
  },
  {
    id: 4, nombre: "Cena día entreno", tipoDia: "ENTRENO", tipo: "cena",
    items: [{ alimentoId: 2, gramos: 250 }, { alimentoId: 22, gramos: 250 }, { alimentoId: 40, gramos: 200 }, { alimentoId: 26, gramos: 7 }],
    nota: "Tilapia ⇄ lubina ⇄ dorada ⇄ pollo, mismo peso.",
  },
  {
    id: 5, nombre: "Desayuno día ligero", tipoDia: "LIGERO", tipo: "desayuno",
    items: [{ alimentoId: 10, gramos: 150 }, { alimentoId: 11, gramos: 200 }, { alimentoId: 19, gramos: 50 }, { alimentoId: 33, gramos: 100 }],
    nota: "",
  },
  {
    id: 6, nombre: "Almuerzo día ligero", tipoDia: "LIGERO", tipo: "almuerzo",
    items: [{ alimentoId: 1, gramos: 250 }, { alimentoId: 16, gramos: 130 }, { alimentoId: 25, gramos: 30 }, { alimentoId: 39, gramos: 200 }, { alimentoId: 26, gramos: 7 }],
    nota: "",
  },
  {
    id: 7, nombre: "Merienda día ligero", tipoDia: "LIGERO", tipo: "merienda",
    items: [{ alimentoId: 12, gramos: 30 }, { alimentoId: 34, gramos: 100 }, { alimentoId: 29, gramos: 20 }],
    nota: "",
  },
  {
    id: 8, nombre: "Cena día ligero", tipoDia: "LIGERO", tipo: "cena",
    items: [{ alimentoId: 5, gramos: 200 }, { alimentoId: 22, gramos: 180 }, { alimentoId: 40, gramos: 250 }, { alimentoId: 26, gramos: 5 }],
    nota: "",
  },
  {
    id: 9, nombre: "Cena ruptura viernes", tipoDia: "AYUNO", tipo: "cena",
    items: [{ alimentoId: 1, gramos: 250 }, { alimentoId: 22, gramos: 250 }, { alimentoId: 39, gramos: 200 }, { alimentoId: 26, gramos: 10 }, { alimentoId: 25, gramos: 50 }],
    nota: "Cena de ruptura ≈24 h después de la cena del jueves. Comida normal, no atracón.",
  },
]
