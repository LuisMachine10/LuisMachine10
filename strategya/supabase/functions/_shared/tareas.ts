// Registro de tareas de ingesta. La Edge Function `ingesta` recibe {"tarea": "<nombre>"} y corre la que corresponda.
// Para agregar una fuente: importa su Tarea aquí y súmala a la lista (ver README · «Cómo agregar una fuente nueva»).

import type { Tarea } from "./ingesta.ts";
import { tareaTesoro } from "./fuentes/tesoro.ts";
import { tareaCotizacionesFmp, tareaMovimientosAcciones } from "./fuentes/fmp.ts";
import { tareaCotizacionesFinnhub } from "./fuentes/finnhub.ts";
import { tareaTasasPolitica } from "./fuentes/tasas-politica.ts";
import { tareaBcrdExcel, tareaBcrdPortada } from "./fuentes/bcrd.ts";
import { tareaCreditoPublico } from "./fuentes/credito-publico.ts";
import { tareaMicm } from "./fuentes/micm.ts";
import { tareaSimv } from "./fuentes/simv.ts";
import { tareaGdelt } from "./fuentes/gdelt.ts";
import { tareaPrensa } from "./fuentes/prensa.ts";
import { TAREAS_INSTITUCIONES } from "./fuentes/rss-instituciones.ts";
import { tareaSec } from "./fuentes/sec-edgar.ts";

const LISTA: Tarea[] = [
  tareaTesoro,
  tareaCotizacionesFmp,
  tareaCotizacionesFinnhub,
  tareaTasasPolitica,
  tareaMovimientosAcciones,
  tareaBcrdPortada,
  tareaBcrdExcel,
  tareaCreditoPublico,
  tareaSimv,
  tareaMicm,
  tareaGdelt,
  tareaPrensa,
  tareaSec,
];

export const TAREAS: Readonly<Record<string, Tarea>> = Object.fromEntries(LISTA.map((t) => [t.nombre, t]));

export function buscarTarea(nombre: unknown): Tarea | null {
  return typeof nombre === "string" && Object.hasOwn(TAREAS, nombre) ? TAREAS[nombre] : null;
}
