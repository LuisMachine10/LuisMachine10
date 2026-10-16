// Motor de retorno: TWR (Dietz modificado por período), TIR (XIRR) del patrimonio y por posición,
// base de costo y P&L desde el libro de transacciones.
//
// Los montos se suman con big.js. La anualización del TWR y la TIR usan float (potencias
// fraccionarias y bisección): son tasas aproximadas por método y se muestran redondeadas.

import { Big, CERO, flotante, n, suma } from "./decimal";
import { mesSiguiente, mesesEntre } from "./fechas";
import { flujoDe, fotoDe } from "./cierres";
import { type Contexto, valorMoneda } from "./posicion";
import type { Activo, Mes } from "./tipos";

export interface PuntoRetorno {
  mes: Mes;
  /** Patrimonio de la foto. */
  V: Big;
  /** Flujo externo (ahorro del período) desde la foto anterior. */
  C: Big;
  meses: number;
}

/**
 * Serie de fotos de patrimonio con el flujo externo de cada período. Solo meses con foto congelada:
 * una foto viva a mitad de mes ensucia la medición porque el flujo del período no está completo.
 */
export function serieRetorno(ctx: Contexto): PuntoRetorno[] {
  const meses = Object.keys(ctx.cierres).filter((m) => ctx.cierres[m].snap).sort();
  const pts: PuntoRetorno[] = [];
  meses.forEach((m, i) => {
    const f = fotoDe(ctx, m);
    if (!f) return;
    let flujo = CERO;
    if (i > 0) {
      let k = meses[i - 1];
      while (k !== m) {
        k = mesSiguiente(k);
        flujo = flujo.plus(flujoDe(ctx.p, ctx.cierres[k]));
      }
    }
    pts.push({ mes: m, V: f.patrimonio, C: flujo, meses: i > 0 ? mesesEntre(meses[i - 1], m) : 0 });
  });
  return pts;
}

export interface ResultadoTwr {
  /** Retorno acumulado (fracción). */
  total: Big;
  /** Anualizado (float, se muestra redondeado). */
  anualizado: number;
  meses: number;
  periodos: { mes: Mes; r: Big }[];
  desde: Mes;
  hasta: Mes;
}

/** Retorno ponderado por tiempo: aísla el efecto de cuándo aportaste. Aporte a mitad de período. */
export function twr(ctx: Contexto): ResultadoTwr | null {
  const pts = serieRetorno(ctx);
  if (pts.length < 2) return null;
  let acum = new Big(1);
  let mesesTot = 0;
  const periodos: ResultadoTwr["periodos"] = [];
  for (let i = 1; i < pts.length; i++) {
    const V0 = pts[i - 1].V;
    const V1 = pts[i].V;
    const C = pts[i].C;
    if (V0.lte(0)) continue;
    const base = V0.plus(C.div(2));
    if (base.eq(0)) continue;
    const r = V1.minus(V0).minus(C).div(base);
    acum = acum.times(r.plus(1)).round(20);
    mesesTot += pts[i].meses;
    periodos.push({ mes: pts[i].mes, r });
  }
  if (!periodos.length || mesesTot === 0) return null;
  return {
    total: acum.minus(1),
    anualizado: Math.pow(flotante(acum), 12 / mesesTot) - 1,
    meses: mesesTot,
    periodos,
    desde: pts[0].mes,
    hasta: pts[pts.length - 1].mes,
  };
}

export interface FlujoFechado {
  f: string;
  v: number;
}

/** TIR sobre flujos fechados, por bisección entre −95 % y +1000 % (float; ver nota del archivo). */
export function xirr(flujos: FlujoFechado[]): number | null {
  if (flujos.length < 2) return null;
  const t0 = Date.parse(`${flujos[0].f}T00:00:00Z`);
  const anios = flujos.map((x) => (Date.parse(`${x.f}T00:00:00Z`) - t0) / (365.25 * 86_400_000));
  const vpn = (r: number) => flujos.reduce((s, x, i) => s + x.v / Math.pow(1 + r, anios[i]), 0);
  const hayPos = flujos.some((x) => x.v > 0);
  const hayNeg = flujos.some((x) => x.v < 0);
  if (!hayPos || !hayNeg) return null;
  let lo = -0.95;
  let hi = 10;
  if (vpn(lo) * vpn(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const medio = (lo + hi) / 2;
    const v = vpn(medio);
    if (Math.abs(v) < 1e-7) return medio;
    if (vpn(lo) * v < 0) hi = medio;
    else lo = medio;
  }
  return (lo + hi) / 2;
}

/** TIR del patrimonio: el rendimiento anual que equivale a tu experiencia real. */
export function tirGlobal(ctx: Contexto): { tir: number; flujos: number; desde: Mes; hasta: Mes } | null {
  const pts = serieRetorno(ctx);
  if (pts.length < 2) return null;
  const fechaDe = (m: Mes) => fotoDe(ctx, m)?.fecha ?? `${m}-28`;
  const flujos: FlujoFechado[] = [{ f: fechaDe(pts[0].mes), v: -flotante(pts[0].V) }];
  for (let i = 1; i < pts.length; i++) {
    let k = pts[i - 1].mes;
    while (k !== pts[i].mes) {
      k = mesSiguiente(k);
      const fl = flujoDe(ctx.p, ctx.cierres[k]);
      if (!fl.eq(0)) flujos.push({ f: `${k}-15`, v: -flotante(fl) });
    }
  }
  flujos.push({ f: fechaDe(pts[pts.length - 1].mes), v: flotante(pts[pts.length - 1].V) });
  flujos.sort((a, b) => (a.f < b.f ? -1 : a.f > b.f ? 1 : 0));
  const r = xirr(flujos);
  return r === null ? null : { tir: r, flujos: flujos.length, desde: pts[0].mes, hasta: pts[pts.length - 1].mes };
}

export interface CostoPosicion {
  cantidad: Big;
  costoTotal: Big;
  costoProm: Big;
  realizado: Big;
  cobrado: Big;
  n: number;
}

/** Base de costo promedio y P&L realizado desde el libro de transacciones (moneda del instrumento). */
export function costoDe(ctx: Contexto, activoId: string): CostoPosicion | null {
  const txs = ctx.tx
    .filter((t) => t.activoId === activoId)
    .sort((a, b) => ((a.fecha ?? "") < (b.fecha ?? "") ? -1 : (a.fecha ?? "") > (b.fecha ?? "") ? 1 : 0));
  if (!txs.length) return null;
  let cant = CERO;
  let costo = CERO;
  let realizado = CERO;
  let cobrado = CERO;
  for (const t of txs) {
    const q = n(t.cantidad);
    const p = n(t.precio);
    const com = n(t.comision);
    if (t.tipo === "compra") {
      costo = costo.plus(q.times(p)).plus(com);
      cant = cant.plus(q);
    } else if (t.tipo === "venta") {
      const prom = cant.gt(0) ? costo.div(cant) : CERO;
      realizado = realizado.plus(q.times(p)).minus(com).minus(q.times(prom));
      costo = costo.minus(q.times(prom));
      cant = cant.minus(q);
    } else {
      cobrado = cobrado.plus(q.times(p)).minus(com);
    }
  }
  return { cantidad: cant, costoTotal: costo, costoProm: cant.gt(0) ? costo.div(cant) : CERO, realizado, cobrado, n: txs.length };
}

export interface RetornoPosicion extends CostoPosicion {
  activo: Activo;
  valorAct: Big;
  noRealizado: Big;
  tir: number | null;
  totalPL: Big;
  retPct: Big | null;
}

/** Retorno por posición (solo las que tienen transacciones). */
export function retornoPosiciones(ctx: Contexto): RetornoPosicion[] {
  const salida: RetornoPosicion[] = [];
  for (const a of ctx.activos) {
    const c = costoDe(ctx, a.id);
    if (!c) continue;
    const valorAct = valorMoneda(ctx, a);
    const noRealizado = valorAct.minus(c.costoTotal);
    const flujos: FlujoFechado[] = ctx.tx
      .filter((t) => t.activoId === a.id && t.fecha)
      .sort((x, y) => (x.fecha! < y.fecha! ? -1 : x.fecha! > y.fecha! ? 1 : 0))
      .map((t) => {
        const bruto = n(t.cantidad).times(n(t.precio));
        const v = (t.tipo === "compra" ? bruto.neg() : bruto).minus(n(t.comision));
        return { f: t.fecha!, v: flotante(v) };
      });
    flujos.push({ f: ctx.hoy, v: flotante(valorAct) });
    const totalPL = suma([c.realizado, c.cobrado, noRealizado]);
    salida.push({
      activo: a,
      ...c,
      valorAct,
      noRealizado,
      tir: xirr(flujos),
      totalPL,
      retPct: c.costoTotal.gt(0) ? totalPL.div(c.costoTotal) : null,
    });
  }
  return salida;
}
