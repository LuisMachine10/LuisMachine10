// JSON con números exactos. Las APIs de precios (FMP, Finnhub, ECB…) mandan números JSON; un
// JSON.parse normal los convierte en float y 0.285 deja de ser 0.285. Aquí cada número llega como
// el texto exacto que escribió la fuente (gracias a JSON.parse con acceso al texto original).

import Big from "big.js";

/** Un número JSON leído sin pasar por float: el texto tal cual vino. */
export type NumeroTexto = string;

let soportado: boolean | null = null;

function verificarSoporte(): boolean {
  if (soportado === null) {
    let visto: unknown;
    // deno-lint-ignore no-explicit-any
    JSON.parse("[0.1]", function (_k: string, v: unknown, ctx?: any) {
      if (typeof v === "number") visto = ctx?.source;
      return v;
    });
    soportado = visto === "0.1";
  }
  return soportado;
}

/** JSON.parse donde todo número se devuelve como string con su texto original ("7705.79", "-13.15"). */
export function jsonExacto<T = unknown>(texto: string): T {
  if (!verificarSoporte()) {
    throw new Error("Este runtime no soporta JSON.parse con texto original: no se pueden leer números exactos");
  }
  // deno-lint-ignore no-explicit-any
  return JSON.parse(texto, function (_k: string, v: unknown, ctx?: any) {
    return typeof v === "number" ? (ctx.source as string) : v;
  }) as T;
}

/**
 * Normaliza un valor numérico de una fuente a decimal sin exponente ("1e-7" → "0.0000001").
 * Devuelve null si no es un número finito (null, "", "N/A", NaN…).
 */
export function aDecimal(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/^\+/, "");
  if (!/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return null;
  const fijo = new Big(s).toFixed();
  return fijo === "-0" ? "0" : fijo;
}
