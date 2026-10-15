// Impacto del día: cuánto se movió el patrimonio por precio y cuánto por tipo de cambio,
// entre la cotización vigente y la anterior de cada símbolo y entre los dos últimos USDDOP_VENTA.
// Sin dato anterior no se inventa movimiento: ese activo cuenta como 0 en ese efecto.

import { Big, CERO, n } from "./decimal";
import { type Contexto, fxDe, normalizarSimbolo, posicion, precioDe } from "./posicion";
import type { Activo } from "./tipos";

export interface ImpactoDia {
  fecha: string;
  efPrecio: Big;
  efFX: Big;
  total: Big;
  detalle: { a: Activo; dPrecio: Big; dFX: Big }[];
  patrimonio: Big;
  /** true si hubo con qué comparar (precio anterior o tipo de cambio anterior). */
  comparable: boolean;
}

export function impactoDia(ctx: Contexto): ImpactoDia | null {
  const precios = Object.values(ctx.mercado.precios);
  const fxAnt = ctx.mercado.fx.USD.origen === "bcrd" ? ctx.mercado.fxAnteriorUSD : null;
  if (!precios.length && !fxAnt) return null;

  const fechas = [...precios.map((p) => p.fecha), ...(ctx.mercado.fx.USD.origen === "bcrd" && ctx.mercado.fx.USD.fecha ? [ctx.mercado.fx.USD.fecha] : [])];
  const fecha = fechas.sort().at(-1)!;
  let efPrecio = CERO;
  let efFX = CERO;
  let comparable = false;
  const detalle: ImpactoDia["detalle"] = [];

  for (const a of ctx.activos) {
    const q = n(a.cantidad);
    if (q.eq(0)) continue;
    const fxH = fxDe(ctx, a.moneda);
    if (fxH === null) continue;
    const vig = precioDe(ctx, a);
    const pxH = vig.precio;
    const m = normalizarSimbolo(a.simbolo) ? vig.mercado : null;
    const pxA = m?.anterior && new Big(m.anterior).gt(0) ? new Big(m.anterior) : pxH;
    const fxA = a.moneda === "USD" && fxAnt ? fxAnt.valor : fxH;
    if (!pxA.eq(pxH) || !fxA.eq(fxH)) comparable = true;
    const dPrecio = q.times(pxH.minus(pxA)).times(fxA);
    const dFX = q.times(pxH).times(fxH.minus(fxA));
    efPrecio = efPrecio.plus(dPrecio);
    efFX = efFX.plus(dFX);
    if (dPrecio.abs().plus(dFX.abs()).gt("0.5")) detalle.push({ a, dPrecio, dFX });
  }
  detalle.sort((x, y) => y.dPrecio.plus(y.dFX).abs().cmp(x.dPrecio.plus(x.dFX).abs()));
  return {
    fecha,
    efPrecio,
    efFX,
    total: efPrecio.plus(efFX),
    detalle: detalle.slice(0, 5),
    patrimonio: posicion(ctx).total,
    comparable,
  };
}
