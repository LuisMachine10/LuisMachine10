// Mutuo / reporto de puesto de bolsa: NO capitaliza solo (manual, sección A). Cada plazo (típico 30 días) vence y
// Mena lo renueva: con la tasa nueva, el capital renovado, el interés que DEJA adentro o que RETIRA a una cuenta y,
// si quiere, un aporte adicional. Si deja el interés y aporta, él mismo hace el interés compuesto.
// Cada renovación es un evento guardado en personal.activos.renovaciones (texto decimal). Puro, con big.js.

import Big from "big.js";

export interface Renovacion {
  /** Día en que renovó (AAAA-MM-DD). */
  fecha: string;
  /** Días del nuevo plazo. */
  plazoDias: number;
  /** Tasa anual del nuevo plazo (fracción). */
  tasa: string;
  /** Capital que había antes de renovar. */
  capitalAnterior: string;
  /** Interés que ganó el plazo que venció (lo que dice el estado del puesto de bolsa). */
  interes: string;
  /** true = dejó el interés adentro; false = lo retiró a una cuenta (Otros ingresos del Presupuesto). */
  dejaInteres: boolean;
  /** Capital adicional que aportó al renovar. */
  aporte: string;
  /** Capital del nuevo plazo = anterior + interés dejado + aporte. */
  capitalNuevo: string;
}

const DEC = /^-?\d+(\.\d+)?$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Lee la columna jsonb (lo que no sirva se descarta). */
export function leerRenovaciones(v: unknown): Renovacion[] {
  if (!Array.isArray(v)) return [];
  const out: Renovacion[] = [];
  for (const x of v.slice(0, 600)) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const d = (k: string) => (typeof r[k] === "string" && DEC.test(r[k] as string) ? (r[k] as string) : null);
    const fecha = typeof r.fecha === "string" && FECHA.test(r.fecha) ? r.fecha : null;
    const plazo = typeof r.plazoDias === "number" && Number.isInteger(r.plazoDias) && r.plazoDias > 0 ? r.plazoDias : null;
    const [tasa, ca, interes, aporte, cn] = [d("tasa"), d("capitalAnterior"), d("interes"), d("aporte"), d("capitalNuevo")];
    if (!fecha || !plazo || tasa === null || ca === null || interes === null || aporte === null || cn === null || typeof r.dejaInteres !== "boolean") continue;
    out.push({ fecha, plazoDias: plazo, tasa, capitalAnterior: ca, interes, dejaInteres: r.dejaInteres, aporte, capitalNuevo: cn });
  }
  return out.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
}

export interface PedidoRenovacion {
  fecha: string;
  plazoDias: number;
  tasa: string;
  interes: string;
  dejaInteres: boolean;
  aporte: string;
}

/** Una renovación: el capital nuevo sale de sumar, nada se supone. */
export function renovar(capitalAnterior: string, p: PedidoRenovacion): Renovacion {
  const nuevo = new Big(capitalAnterior).plus(p.dejaInteres ? p.interes : "0").plus(p.aporte || "0");
  return {
    fecha: p.fecha,
    plazoDias: p.plazoDias,
    tasa: p.tasa,
    capitalAnterior: new Big(capitalAnterior).toFixed(),
    interes: new Big(p.interes || "0").toFixed(),
    dejaInteres: p.dejaInteres,
    aporte: new Big(p.aporte || "0").toFixed(),
    capitalNuevo: nuevo.toFixed(),
  };
}

export interface EstadoMutuo {
  capital: string;
  tasa: string | null;
  /** Fecha en que vence el plazo vigente (última renovación + plazo). */
  vence: string | null;
  interesDejado: string;
  interesRetirado: string;
  aportes: string;
  renovaciones: number;
  /** Lo que Mena hizo la última vez (para proyectar igual: «según tu última renovación»). null sin renovaciones. */
  dejaInteres: boolean | null;
}

const sumarDias = (f: string, d: number) => {
  const x = new Date(`${f}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
};

/** El estado de un mutuo después de sus renovaciones (capital de partida = el anotado antes de la primera). */
export function estadoMutuo(capitalInicial: string, renovaciones: readonly Renovacion[]): EstadoMutuo {
  let dejado = new Big(0);
  let retirado = new Big(0);
  let aportes = new Big(0);
  for (const r of renovaciones) {
    if (r.dejaInteres) dejado = dejado.plus(r.interes);
    else retirado = retirado.plus(r.interes);
    aportes = aportes.plus(r.aporte);
  }
  const u = renovaciones.at(-1);
  return {
    capital: u ? u.capitalNuevo : new Big(capitalInicial).toFixed(),
    tasa: u ? u.tasa : null,
    vence: u ? sumarDias(u.fecha, u.plazoDias) : null,
    interesDejado: dejado.toFixed(),
    interesRetirado: retirado.toFixed(),
    aportes: aportes.toFixed(),
    renovaciones: renovaciones.length,
    dejaInteres: u ? u.dejaInteres : null,
  };
}

/** Cada cuántos meses se renueva en la proyección: el plazo en meses de 30 días (mínimo 1). */
export function mesesDePlazo(plazoDias: number | null | undefined): number {
  const d = plazoDias && plazoDias > 0 ? plazoDias : 30;
  return Math.max(1, Math.round(d / 30));
}
