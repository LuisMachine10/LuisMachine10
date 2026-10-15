// Proyección del patrimonio, escenarios y sensibilidad (±20 % por variable).
//
// Son proyecciones con los supuestos que Mena escribe en sus parámetros, no datos: la pantalla
// las rotula siempre como «proyección». Los montos se acumulan con big.js; la tasa mensual
// equivalente ((1 + r)^(1/12) − 1) y el descuento por inflación usan float (ver lib/capital/decimal.ts).

import { Big, CERO, desdeFlotante, flotante, n, redondearTrabajo } from "./decimal";
import { type Contexto, posicion } from "./posicion";
import type { Escenario } from "./tipos";

export interface OpcionesProyeccion {
  V0?: Big;
  /** Años. */
  horizonte: Big;
  retorno: Big;
  inflacion: Big;
  deprecFX: Big;
  aporte: Big;
  incrAporte: Big;
}

export interface PuntoProyeccion {
  t: number;
  nom: Big;
  real: Big;
  aportado: Big;
}

export interface Proyeccion {
  pts: PuntoProyeccion[];
  meses: number;
  inicial: Big;
  final: Big;
  finalReal: Big;
  aportado: Big;
  rendimiento: Big;
  rEfectivo: Big;
  pesoFX: Big;
}

export function proyectar(ctx: Contexto, o: OpcionesProyeccion): Proyeccion {
  const pos = posicion(ctx);
  const V0 = o.V0 ?? pos.total;
  const meses = Math.max(1, Math.round(flotante(o.horizonte) * 12));
  const pesoFX = pos.total.gt(0) ? pos.extranjero.div(pos.total) : CERO;
  // El retorno efectivo suma la depreciación del peso sobre la porción en moneda extranjera.
  const rEfectivo = o.retorno.plus(pesoFX.times(o.deprecFX));
  const rM = desdeFlotante(Math.pow(1 + flotante(rEfectivo), 1 / 12) - 1);
  const iM = 1 + (Math.pow(1 + flotante(o.inflacion), 1 / 12) - 1);
  let v = V0;
  let ap = o.aporte;
  let aportado = CERO;
  const pts: PuntoProyeccion[] = [{ t: 0, nom: v, real: v, aportado: CERO }];
  for (let t = 1; t <= meses; t++) {
    if (t > 1 && (t - 1) % 12 === 0) ap = redondearTrabajo(ap.times(o.incrAporte.plus(1)));
    v = redondearTrabajo(v.times(rM.plus(1)).plus(ap));
    aportado = aportado.plus(ap);
    pts.push({ t, nom: v, real: redondearTrabajo(v.div(desdeFlotante(Math.pow(iM, t)))), aportado });
  }
  const fin = pts[pts.length - 1];
  return {
    pts,
    meses,
    inicial: V0,
    final: fin.nom,
    finalReal: fin.real,
    aportado: fin.aportado,
    rendimiento: fin.nom.minus(V0).minus(fin.aportado),
    rEfectivo,
    pesoFX,
  };
}

export function opcionesDe(ctx: Contexto, e: Escenario): OpcionesProyeccion {
  return {
    retorno: n(e.retorno),
    inflacion: n(e.inflacion),
    deprecFX: n(e.deprecFX),
    aporte: n(e.aporte),
    horizonte: n(ctx.p.horizonte),
    incrAporte: n(ctx.p.incrAporteAnual),
  };
}

export function escenarios(ctx: Contexto): (Escenario & { proy: Proyeccion })[] {
  return ctx.p.escenarios.map((e) => ({ ...e, proy: proyectar(ctx, opcionesDe(ctx, e)) }));
}

export function escenarioBase(ctx: Contexto): Escenario | null {
  return ctx.p.escenarios.find((e) => e.id === "base") ?? ctx.p.escenarios[0] ?? null;
}

type Variable = "aporte" | "retorno" | "deprecFX" | "inflacion";

export interface FilaSensibilidad {
  id: Variable;
  nom: string;
  v: Big;
  bajo: Big;
  alto: Big;
  rango: Big;
  ref: Big;
  max: Big;
}

/** Cuánto mueve el patrimonio REAL final cada variable si se mueve ±20 % (las demás en el escenario base). */
export function sensibilidad(ctx: Contexto): FilaSensibilidad[] {
  const base = escenarioBase(ctx);
  if (!base) return [];
  const o = opcionesDe(ctx, base);
  const ref = proyectar(ctx, o).finalReal;
  const variables: { id: Variable; nom: string }[] = [
    { id: "aporte", nom: "Aporte mensual" },
    { id: "retorno", nom: "Retorno anual" },
    { id: "deprecFX", nom: "Depreciación del peso" },
    { id: "inflacion", nom: "Inflación RD" },
  ];
  const filas = variables.map((d) => {
    const v = o[d.id];
    const bajo = proyectar(ctx, { ...o, [d.id]: v.times("0.8") }).finalReal.minus(ref);
    const alto = proyectar(ctx, { ...o, [d.id]: v.times("1.2") }).finalReal.minus(ref);
    return { ...d, v, bajo, alto, rango: alto.minus(bajo).abs() };
  });
  filas.sort((a, b) => b.rango.cmp(a.rango));
  const max = filas[0]?.rango ?? CERO;
  return filas.map((f) => ({ ...f, ref, max }));
}

/** Meses hasta que el escenario alcanza la meta, o null si no la alcanza en el horizonte. */
export function mesesHastaMeta(p: Proyeccion, meta: Big): number | null {
  const i = p.pts.findIndex((x) => x.nom.gte(meta));
  return i > 0 ? i : null;
}

export function sumaAportes(pts: PuntoProyeccion[]): Big {
  return pts.length ? pts[pts.length - 1].aportado : new Big(0);
}
