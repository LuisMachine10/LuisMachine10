// Registro de tareas de ingesta. La Edge Function `ingesta` recibe {"tarea": "<nombre>"} y corre la que corresponda.
// Para agregar una fuente: importa su Tarea aquí y súmala a la lista (ver README · «Cómo agregar una fuente nueva»).

import type { Tarea } from "./ingesta.ts";
import { tareaTesoro } from "./fuentes/tesoro.ts";
import { tareaAlertas } from "./fuentes/alertas.ts";
import { tareaIaPorque } from "./fuentes/ia-porque.ts";
import { tareaIaResumen } from "./fuentes/ia-resumen.ts";

const LISTA: Tarea[] = [
  tareaTesoro,
  tareaAlertas,
  tareaIaPorque,
  tareaIaResumen,
];

export const TAREAS: Readonly<Record<string, Tarea>> = Object.fromEntries(LISTA.map((t) => [t.nombre, t]));

export function buscarTarea(nombre: unknown): Tarea | null {
  return typeof nombre === "string" && Object.hasOwn(TAREAS, nombre) ? TAREAS[nombre] : null;
}
