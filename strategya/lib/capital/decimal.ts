// Aritmética decimal de Mena Capital. Montos y tasas se operan con big.js, nunca con float.
//
// Excepción documentada: potencias con exponente fraccionario ((1 + r)^(1/12), (1 + y)^−n),
// la TIR (bisección) y la anualización del TWR se calculan con float, porque big.js no tiene
// potencias fraccionarias y son métodos aproximados por naturaleza. Esos factores se convierten
// a Big con 15 cifras significativas antes de multiplicar montos, y las tasas resultantes se
// muestran siempre redondeadas (1–2 decimales), así que el error del float no llega a la pantalla.

import Big from "big.js";
import type { Dec } from "./tipos";

export { Big };

export const CERO = new Big(0);
export const UNO = new Big(1);

/** Como num() del artefacto: vacío o ausente vale 0. El texto ya viene validado. */
export function n(x: Dec | null | undefined): Big {
  return x === null || x === undefined || x === "" ? CERO : new Big(x);
}

/** null si está vacío; Big si tiene valor. */
export function nOpc(x: Dec | null | undefined): Big | null {
  return x === null || x === undefined || x === "" ? null : new Big(x);
}

export function suma(xs: Iterable<Big>): Big {
  let s = CERO;
  for (const x of xs) s = s.plus(x);
  return s;
}

/** a / b, o null si b es 0 (el artefacto devolvía 0; aquí la pantalla dice «sin datos»). */
export function div(a: Big, b: Big): Big | null {
  return b.eq(0) ? null : a.div(b);
}

export function maximo(a: Big, b: Big): Big {
  return a.gt(b) ? a : b;
}

export function texto(b: Big): Dec {
  const s = b.toFixed();
  return s === "-0" ? "0" : s;
}

/** Big → float. Solo para tasas en métodos aproximados y para ubicar puntos en gráficos. */
export function flotante(b: Big): number {
  return Number(b.toFixed(15));
}

/** float → Big con 15 cifras significativas (factores de potencias fraccionarias). */
export function desdeFlotante(x: number): Big {
  if (!Number.isFinite(x)) throw new Error(`Valor no finito en un cálculo: ${x}`);
  return new Big(x.toPrecision(15));
}

/** (1 + r)^e con float, devuelto como Big. r es fracción. */
export function factor(r: Big | number, e: number): Big {
  const base = 1 + (typeof r === "number" ? r : flotante(r));
  return desdeFlotante(Math.pow(base, e));
}

/** Redondeo de trabajo para que los montos no acumulen cientos de decimales en los bucles. */
export function redondearTrabajo(b: Big): Big {
  return b.round(10, Big.roundHalfEven);
}
