// Formato de cifras de Mena Capital, sobre lib/formato.ts (cifra exacta, signo menos tipográfico).

import { cifra, cifraConSigno } from "../formato";
import { Big } from "./decimal";

type Valor = Big | string | number;

function aTexto(v: Valor): string {
  if (typeof v === "number") return Number.isFinite(v) ? v.toFixed(12) : "0";
  return typeof v === "string" ? v : v.toFixed();
}

/** "1,234" con d decimales. */
export function num(v: Valor, d = 0): string {
  return cifra(aTexto(v), d);
}

/** "RD$ 1,234". */
export function rd(v: Valor, d = 0): string {
  return `RD$ ${cifra(aTexto(v), d)}`;
}

/** "+1,234" / "−1,234". */
export function sg(v: Valor, d = 0): string {
  return cifraConSigno(aTexto(v), d);
}

/** Fracción → porcentaje: 0.045 → "4.5%". null → "—". */
export function pct(v: Valor | null | undefined, d = 1): string {
  if (v === null || v === undefined) return "—";
  return `${cifra(new Big(aTexto(v)).times(100).toFixed(), d)}%`;
}

/** Fracción → porcentaje con signo. */
export function pctSg(v: Valor | null | undefined, d = 1): string {
  if (v === null || v === undefined) return "—";
  return `${cifraConSigno(new Big(aTexto(v)).times(100).toFixed(), d)}%`;
}

/** Fracción → puntos básicos con signo: 0.0125 → "+125 pb". */
export function pb(v: Valor): string {
  return `${cifraConSigno(new Big(aTexto(v)).times(10000).toFixed(), 0)} pb`;
}

/** Puntos porcentuales: 0.031 → "3.1 pp". */
export function pp(v: Valor, d = 1): string {
  return `${cifra(new Big(aTexto(v)).times(100).abs().toFixed(), d)} pp`;
}

/** Cifra compacta para espacios chicos (centro de un donut): 1234567 → "1.23M", 45678 → "45.7k". */
export function compacto(v: Valor): string {
  const x = new Big(aTexto(v));
  const a = x.abs();
  if (a.gte(1e6)) return `${cifra(x.div(1e6).toFixed(), a.gte(1e8) ? 0 : 2)}M`;
  if (a.gte(1e3)) return `${cifra(x.div(1e3).toFixed(), a.gte(1e5) ? 0 : 1)}k`;
  return cifra(x.toFixed(), 0);
}

export type Tono = "ok" | "alerta" | "error" | "neutra";

/** Mayor es mejor. */
export function tono(v: Big | number | null, buena: Big | number | string, mala: Big | number | string): Tono {
  if (v === null) return "neutra";
  const x = new Big(aTexto(v));
  return x.gte(aTexto(buena as Valor)) ? "ok" : x.gte(aTexto(mala as Valor)) ? "alerta" : "error";
}

/** Menor es mejor. */
export function tonoInverso(v: Big | number | null, buena: Big | number | string, mala: Big | number | string): Tono {
  if (v === null) return "neutra";
  const x = new Big(aTexto(v));
  return x.lte(aTexto(buena as Valor)) ? "ok" : x.lte(aTexto(mala as Valor)) ? "alerta" : "error";
}

export function claseSigno(v: Big | number | null | undefined): "sube" | "baja" | "igual" {
  if (v === null || v === undefined) return "igual";
  const x = new Big(aTexto(v));
  return x.gt(0) ? "sube" : x.lt(0) ? "baja" : "igual";
}

export function flecha(v: Big | number | null | undefined): string {
  const c = claseSigno(v);
  return c === "sube" ? "↑" : c === "baja" ? "↓" : "";
}
