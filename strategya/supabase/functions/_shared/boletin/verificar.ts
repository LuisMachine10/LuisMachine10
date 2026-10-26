// Verificaciones del texto final: ningún número que no venga de los datos y ningún número de cuenta.
// Las usan las pruebas (y sirven para revisar una edición guardada). Los enlaces no se revisan: sus
// dígitos son identificadores de la página de la fuente, no cifras.

import Big from "big.js";

const TOKEN_NUMERICO = /\d(?:[\d.,]*\d)?/g;
const URL = /https?:\/\/\S+/g;

function canonico(s: string): string | null {
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return new Big(s).toFixed();
}

/** Lecturas de un token: «4,107.90» (miles con coma) o «2,5» (decimal con coma). */
export function lecturasNumero(token: string): string[] {
  const out = new Set<string>();
  const a = canonico(token.replace(/,/g, ""));
  if (a) out.add(a);
  if ((token.match(/,/g)?.length ?? 0) <= 1 && !token.includes(".")) {
    const b = canonico(token.replace(",", "."));
    if (b) out.add(b);
  }
  return [...out];
}

/** Números que el texto puede citar: los de los valores dados y sus redondeos a 0–4 decimales. */
export function numerosPermitidos(valores: Iterable<string>): Set<string> {
  const permitidos = new Set<string>();
  for (const v of valores) {
    for (const t of String(v).match(TOKEN_NUMERICO) ?? []) {
      for (const l of lecturasNumero(t)) {
        permitidos.add(l);
        const n = new Big(l);
        for (let d = 0; d <= 4; d++) permitidos.add(new Big(n.toFixed(d, Big.roundHalfUp)).toFixed());
      }
    }
  }
  return permitidos;
}

/** Tokens numéricos del texto (fuera de los enlaces) que no están permitidos. Vacío = no inventa cifras. */
export function numerosAjenos(texto: string, permitidos: Set<string>): string[] {
  const ajenos: string[] = [];
  for (const m of texto.replace(URL, " ").matchAll(TOKEN_NUMERICO)) {
    if (!lecturasNumero(m[0]).some((l) => permitidos.has(l))) ajenos.push(m[0]);
  }
  return ajenos;
}

/** Secuencias de 6 o más dígitos seguidos (sin separadores) fuera de los enlaces: parecen cuentas o cédulas. */
export function digitosDeCuenta(texto: string): string[] {
  return texto.replace(URL, " ").match(/(?<![\d.,])\d{6,}(?![\d])/g) ?? [];
}
