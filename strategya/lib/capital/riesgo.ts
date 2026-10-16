// Motor de riesgo: duración modificada, concentración por emisor, escalera de vencimientos,
// sensibilidad cambiaria, puente de patrimonio (con efecto cambiario), rebalanceo y diferenciales.
//
// La duración usa float (potencia fraccionaria); se convierte a Big con 15 cifras antes de
// multiplicar montos y se muestra con 2 decimales.

import { Big, CERO, desdeFlotante, div, factor, flotante, maximo, n, suma } from "./decimal";
import { aniosEntre, dias, mesPrevio, mesSiguiente, mesesEntre } from "./fechas";
import { flujoDe, fotoDe, fotoHasta, indicadores, sumIngresos } from "./cierres";
import { type Contexto, posicion, valorDOP, valorMoneda } from "./posicion";
import type { Activo, Clase, Mes, MonedaExtranjera } from "./tipos";
import { CLASES } from "./tipos";

/** Duración modificada (años). Bono a la par con cupón, o instrumento que acumula a vencimiento. */
export function duracionModificada(a: Activo, hoy: string): number | null {
  if (a.clase !== "rentafija" || !a.venc) return null;
  const plazo = aniosEntre(hoy, a.venc);
  if (plazo <= 0) return 0;
  const y = flotante(n(a.tasa)); // float: potencia fraccionaria (ver nota del archivo)
  if (a.tipoRF === "cupon" && y > 0) {
    const macaulay = ((1 + y) / y) * (1 - Math.pow(1 + y, -plazo));
    return macaulay / (1 + y);
  }
  return plazo / (1 + y); // acumula a vencimiento: Macaulay = plazo
}

export interface DetalleRentaFija {
  a: Activo;
  v: Big;
  d: number | null;
  /** Cambio de valor de mercado si las tasas suben 100 pb (RD$). */
  sens100: Big | null;
}

export interface Riesgo {
  duracion: Big | null;
  conVenc: Big;
  sinDuracion: Big;
  sensRF100: Big | null;
  detalle: DetalleRentaFija[];
  rfTotal: Big;
  emisores: { nombre: string; valor: Big; pct: Big | null }[];
  maxEmisor: { nombre: string; valor: Big; pct: Big | null } | null;
  /** Año → RD$ que vence ese año. */
  escalera: Record<string, Big>;
  sinVenc: Big;
  fxSens: { d: Big; impacto: Big }[];
  pesoFX: Big | null;
  expoFX: Big;
}

const UN_PORCIENTO = new Big("0.01");

export function riesgo(ctx: Contexto): Riesgo {
  const pos = posicion(ctx);
  const rf = ctx.activos.filter((a) => a.clase === "rentafija");
  let rfTotal = CERO;
  let durPond = CERO;
  let conVenc = CERO;
  const detalle: DetalleRentaFija[] = [];
  for (const a of rf) {
    const v = valorDOP(ctx, a);
    if (v === null) continue;
    rfTotal = rfTotal.plus(v);
    const d = duracionModificada(a, ctx.hoy);
    if (d !== null) {
      durPond = durPond.plus(v.times(desdeFlotante(d)));
      conVenc = conVenc.plus(v);
    }
    detalle.push({ a, v, d, sens100: d === null ? null : v.times(desdeFlotante(d)).times(UN_PORCIENTO).neg() });
  }
  const duracion = conVenc.gt(0) ? durPond.div(conVenc) : null;
  const sensRF100 = duracion === null ? null : duracion.times(UN_PORCIENTO).times(conVenc).neg();

  const emisores = Object.entries(pos.porEmisor)
    .map(([nombre, valor]) => ({ nombre, valor, pct: div(valor, pos.total) }))
    .sort((a, b) => b.valor.cmp(a.valor));

  const escalera: Record<string, Big> = {};
  for (const a of ctx.activos) {
    if (!a.venc) continue;
    const v = valorDOP(ctx, a);
    if (v === null) continue;
    const anio = a.venc.slice(0, 4);
    escalera[anio] = (escalera[anio] ?? CERO).plus(v);
  }
  const sinVenc = rfTotal.minus(suma(Object.values(escalera)));

  return {
    duracion,
    conVenc,
    sinDuracion: rfTotal.minus(conVenc),
    sensRF100,
    detalle,
    rfTotal,
    emisores,
    maxEmisor: emisores[0] ?? null,
    escalera,
    sinVenc,
    fxSens: ["0.05", "0.10"].map((d) => ({ d: new Big(d), impacto: pos.extranjero.times(d) })),
    pesoFX: div(pos.extranjero, pos.total),
    expoFX: pos.extranjero,
  };
}

export interface Puente {
  desde: Mes;
  hasta: Mes;
  meses: number;
  mesesSinCierre: number;
  patAnterior: Big;
  patActual: Big;
  dPat: Big;
  flujo: Big;
  rend: Big;
  efectoFX: Big;
  fxMedible: boolean;
  sinExplicar: Big;
  umbral: Big;
  alerta: boolean;
}

/** Puente de patrimonio: ahorro + rendimiento devengado + efecto cambiario + lo que no cuadra. */
export function puente(ctx: Contexto, m: Mes): Puente | null {
  const s = fotoDe(ctx, m);
  if (!s) return null;
  const ant = fotoHasta(ctx, mesPrevio(m));
  if (!ant) return null;
  const sp = ant.foto;
  const ind = indicadores(ctx, m);
  const meses = Math.max(1, mesesEntre(ant.mes, m));

  let flujo = CERO;
  let sinCierre = 0;
  let k = ant.mes;
  for (let i = 0; i < meses; i++) {
    k = mesSiguiente(k);
    const c = ctx.cierres[k];
    if (c && sumIngresos(ctx.p, c).gt(0)) flujo = flujo.plus(flujoDe(ctx.p, c));
    else sinCierre++;
  }

  // Efecto cambiario: exposición actual en moneda extranjera × variación de la tasa entre fotos.
  const fxA = sp.fx && sp.fx.USD ? sp.fx : null;
  const fxB = s.fx && s.fx.USD ? s.fx : { USD: ctx.mercado.fx.USD.valor, EUR: ctx.mercado.fx.EUR.valor };
  let efectoFX = CERO;
  const fxMedible = fxA !== null;
  if (fxA) {
    for (const a of ctx.activos) {
      if (a.moneda === "DOP") continue;
      const mon = a.moneda as MonedaExtranjera;
      const tA = fxA[mon];
      const tB = fxB[mon];
      if (!tA || !tB) continue; // sin las dos tasas no se inventa la variación
      efectoFX = efectoFX.plus(valorMoneda(ctx, a).times(tB.minus(tA)));
    }
  }

  const rend = ind.yieldPort ? sp.patrimonio.times(factor(ind.yieldPort, meses / 12).minus(1)) : CERO;
  const dPat = s.patrimonio.minus(sp.patrimonio);
  const sinExplicar = dPat.minus(flujo).minus(rend).minus(efectoFX);
  const umbral = maximo(new Big(2000), sp.patrimonio.abs().times("0.02"));
  return {
    desde: ant.mes,
    hasta: m,
    meses,
    mesesSinCierre: sinCierre,
    patAnterior: sp.patrimonio,
    patActual: s.patrimonio,
    dPat,
    flujo,
    rend,
    efectoFX,
    fxMedible,
    sinExplicar,
    umbral,
    alerta: sinExplicar.abs().gt(umbral),
  };
}

export type EstadoBanda = "en banda" | "sobre meta" | "bajo meta";

export interface FilaRebalanceo {
  id: Clase;
  nom: string;
  actual: Big;
  pctA: Big;
  obj: Big;
  objDOP: Big;
  /** RD$ que faltan (+) o sobran (−) para llegar a la meta. */
  dif: Big;
  /** Desvío en fracción (0.03 = 3 pp). */
  dpp: Big;
  estado: EstadoBanda;
}

/** Asignación actual contra la meta de Mena, con su banda. Descriptivo: no recomienda operaciones. */
export function rebalanceo(ctx: Contexto): FilaRebalanceo[] {
  const pos = posicion(ctx);
  const banda = n(ctx.p.bandaRebalanceo).gt(0) ? n(ctx.p.bandaRebalanceo) : new Big("0.02");
  return CLASES.map((c) => {
    const actual = pos.porClase[c.id];
    const pctA = pos.total.gt(0) ? actual.div(pos.total) : CERO;
    const obj = n(ctx.p.metaAsignacion[c.id]);
    const objDOP = pos.total.times(obj);
    const dpp = pctA.minus(obj);
    const estado: EstadoBanda = dpp.gt(banda) ? "sobre meta" : dpp.lt(banda.neg()) ? "bajo meta" : "en banda";
    return { id: c.id, nom: c.nom, actual, pctA, obj, objDOP, dif: objDOP.minus(actual), dpp, estado };
  });
}

export interface Diferenciales {
  refs: { id: string; nom: string; v: Big; fecha: string; url: string | null }[];
  yieldRF: Big | null;
  rfTot: Big;
  instr: { a: Activo; tasa: Big; spread: Big | null }[];
  hayRef: boolean;
}

/** Tus tasas de renta fija contra las referencias oficiales guardadas (TPM, inflación). */
export function diferenciales(ctx: Contexto): Diferenciales {
  const refs = ctx.mercado.referencias
    .filter((r) => r.valor.gt(0))
    .map((r) => ({ id: r.serie, nom: r.nombre, v: r.valor, fecha: r.fecha, url: r.url }));
  const rf = ctx.activos.filter((a) => a.clase === "rentafija" && (valorDOP(ctx, a) ?? CERO).gt(0));
  const rfTot = suma(rf.map((a) => valorDOP(ctx, a)!));
  const yieldRF = rfTot.gt(0) ? suma(rf.map((a) => valorDOP(ctx, a)!.times(n(a.tasa)))).div(rfTot) : null;
  const base = refs[0];
  const instr = rf
    .map((a) => ({ a, tasa: n(a.tasa), spread: base ? n(a.tasa).minus(base.v) : null }))
    .sort((x, y) => y.tasa.cmp(x.tasa));
  return { refs, yieldRF, rfTot, instr, hayRef: refs.length > 0 };
}

/** Instrumentos que vencen en ≤ 120 días y pagan más de 1 punto bajo la referencia. */
export function ventanasReinversion(ctx: Contexto): { a: Activo; d: number; spread: Big; ref: Big; refNom: string }[] {
  const ref = ctx.mercado.referencias.find((r) => r.valor.gt(0) && r.serie !== "INFLACION_RD");
  if (!ref) return [];
  return ctx.activos
    .filter((a) => a.clase === "rentafija" && a.venc)
    .map((a) => ({ a, d: dias(ctx.hoy, a.venc!), spread: ref.valor.minus(n(a.tasa)), ref: ref.valor, refNom: ref.nombre }))
    .filter((x) => x.d <= 120 && x.spread.gt("0.01"));
}
