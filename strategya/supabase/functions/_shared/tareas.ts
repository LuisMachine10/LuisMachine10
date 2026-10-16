// Registro de tareas de ingesta. La Edge Function `ingesta` recibe {"tarea": "<nombre>"} y corre la que corresponda.
// Para agregar una fuente: importa su Tarea aquí y súmala a la lista (ver README · «Cómo agregar una fuente nueva»).

import type { Tarea } from "./ingesta.ts";
import { tareaTesoro } from "./fuentes/tesoro.ts";
import { tareaCotizacionesFmp, tareaMovimientosAcciones } from "./fuentes/fmp.ts";
import { tareaCotizacionesFinnhub } from "./fuentes/finnhub.ts";
import { tareaCotizacionesCboe } from "./fuentes/cboe.ts";
import { tareaDivisasBce } from "./fuentes/ecb-fx.ts";
import { tareaCierresFred } from "./fuentes/fred-mercado.ts";
import { tareaTasasPolitica } from "./fuentes/tasas-politica.ts";
import { tareaBcrdExcel, tareaBcrdPortada } from "./fuentes/bcrd.ts";
import { tareaCreditoPublico } from "./fuentes/credito-publico.ts";
import { tareaMicm } from "./fuentes/micm.ts";
import { tareaSimv } from "./fuentes/simv.ts";
import { tareaGdelt } from "./fuentes/gdelt.ts";
import { tareaPrensa } from "./fuentes/prensa.ts";
import { TAREAS_INSTITUCIONES } from "./fuentes/rss-instituciones.ts";
import { tareaSec } from "./fuentes/sec-edgar.ts";
import { tareaAlertas } from "./fuentes/alertas.ts";
import { tareaIaPorque } from "./fuentes/ia-porque.ts";
import { tareaIaResumen } from "./fuentes/ia-resumen.ts";
import { tareaPreciosCartera } from "./fuentes/precios-cartera.ts";
import { tareaSismosUsgs } from "./fuentes/sismos-usgs.ts";
import { tareaCiclonesNhc } from "./fuentes/ciclones-nhc.ts";
import { tareaBuquesAis } from "./fuentes/buques-ais.ts";

const LISTA: Tarea[] = [
  tareaTesoro,
  tareaCotizacionesFmp,
  tareaCotizacionesFinnhub,
  tareaCotizacionesCboe,
  tareaDivisasBce,
  tareaCierresFred,
  tareaTasasPolitica,
  tareaMovimientosAcciones,
  tareaBcrdPortada,
  tareaBcrdExcel,
  tareaCreditoPublico,
  tareaSimv,
  tareaMicm,
  tareaGdelt,
  tareaPrensa,
  ...TAREAS_INSTITUCIONES,
  tareaSec,
  tareaAlertas,
  tareaIaPorque,
  tareaIaResumen,
  tareaPreciosCartera,
  tareaSismosUsgs,
  tareaCiclonesNhc,
  tareaBuquesAis,
];

export const TAREAS: Readonly<Record<string, Tarea>> = Object.fromEntries(LISTA.map((t) => [t.nombre, t]));

export function buscarTarea(nombre: unknown): Tarea | null {
  return typeof nombre === "string" && Object.hasOwn(TAREAS, nombre) ? TAREAS[nombre] : null;
}
