// Formato de montos del Calendario de Caja (sobre lib/formato.ts; nada pasa por float).

import Big from "big.js";
import { cifra } from "../formato";

const MENOS = "−";

/** "RD$ 12,345.50" */
export function rd(texto: string): string {
  const c = cifra(texto, 2);
  return c.startsWith(MENOS) ? `${MENOS}RD$ ${c.slice(1)}` : `RD$ ${c}`;
}

/** "US$ 1,200.00" */
export function usd(texto: string): string {
  const c = cifra(texto, 2);
  return c.startsWith(MENOS) ? `${MENOS}US$ ${c.slice(1)}` : `US$ ${c}`;
}

export function enMoneda(texto: string, moneda: "DOP" | "USD"): string {
  return moneda === "USD" ? usd(texto) : rd(texto);
}

/**
 * Saldo abreviado para las celdas del calendario: 850 · 12.3k · 125k · 1.25M (con − si es negativo).
 * Redondeo mitad hacia arriba sobre el decimal exacto.
 */
export function abreviado(texto: string): string {
  const v = new Big(texto);
  const neg = v.lt(0);
  const a = v.abs();
  let s: string;
  if (a.lt(1000)) s = a.round(0, Big.roundHalfUp).toString();
  else if (a.lt(100_000)) s = `${quitarCeros(a.div(1000).toFixed(1, Big.roundHalfUp))}k`;
  else if (a.lt(1_000_000)) s = `${a.div(1000).round(0, Big.roundHalfUp).toString()}k`;
  else s = `${quitarCeros(a.div(1_000_000).toFixed(2, Big.roundHalfUp))}M`;
  if (s === "1000k") s = "1M";
  return neg && s !== "0" ? `${MENOS}${s}` : s;
}

function quitarCeros(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}
