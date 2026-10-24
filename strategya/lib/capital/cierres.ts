// Cierres mensuales: totales por grupo, tarjetas, pasivos, fotos de patrimonio e indicadores del mes.

import { Big, CERO, div, n, suma } from "./decimal";
import { mesPrevio } from "./fechas";
import { type Contexto, posicion } from "./posicion";
import { balance } from "./registro";
import type { Cierre, Dec, Foto, ListaPresupuesto, Mes, Parametros } from "./tipos";

const TOTAL_AGREGADO: Record<ListaPresupuesto, keyof Cierre> = {
  ingresos: "totIngresos",
  fijos: "totFijos",
  variables: "totVariables",
  aportes: "totAportes",
};

/** Total de un grupo. Un mes agregado usa su total; uno desglosado suma solo las partidas vigentes. */
export function sumaGrupo(p: Parametros, c: Cierre | null | undefined, grupo: ListaPresupuesto): Big {
  if (!c) return CERO;
  if (c.agregado) return n(c[TOTAL_AGREGADO[grupo]] as Dec | null);
  const montos = c[grupo] ?? {};
  return suma(p[grupo].map((i) => n(montos[i.id])));
}

export const sumIngresos = (p: Parametros, c: Cierre | null | undefined) => sumaGrupo(p, c, "ingresos");
export const sumFijos = (p: Parametros, c: Cierre | null | undefined) => sumaGrupo(p, c, "fijos");
export const sumVariables = (p: Parametros, c: Cierre | null | undefined) => sumaGrupo(p, c, "variables");
export const sumAportes = (p: Parametros, c: Cierre | null | undefined) => sumaGrupo(p, c, "aportes");

/** Ingresos − gasto operativo (fijos + variables). */
export function flujoDe(p: Parametros, c: Cierre | null | undefined): Big {
  return sumIngresos(p, c).minus(sumFijos(p, c)).minus(sumVariables(p, c));
}

export interface ResumenTarjetas {
  uso: Big;
  limite: Big;
  pct: Big | null;
  alguna: boolean;
  impago: boolean;
}

export function usoTarjetas(p: Parametros, c: Cierre | null | undefined): ResumenTarjetas {
  let uso = CERO;
  let limite = CERO;
  let alguna = false;
  let impago = false;
  for (const t of p.tarjetas) {
    const d = c?.tarjetas?.[t.id];
    limite = limite.plus(n(t.limite));
    if (d) {
      uso = uso.plus(n(d.uso));
      alguna = true;
      if (n(d.uso).gt(0) && d.full === false) impago = true;
    }
  }
  return { uso, limite, pct: limite.gt(0) ? uso.div(limite) : null, alguna, impago };
}

export function pasivosDe(c: Cierre | null | undefined): Big {
  const d = c?.deudas;
  return d ? n(d.tc).plus(n(d.prestamos)).plus(n(d.otras)) : CERO;
}

export interface FotoCalculada {
  activos: Big;
  pasivos: Big;
  patrimonio: Big;
  liquidos: Big;
  ingresoPasivoAnual: Big;
  fecha: string | null;
  fx: { USD: Big | null; EUR: Big | null } | null;
  /** true = calculada ahora con la cartera actual (no congelada en un cierre). */
  vivo: boolean;
}

export function desdeFoto(f: Foto): FotoCalculada {
  return {
    activos: n(f.activos),
    pasivos: n(f.pasivos),
    patrimonio: n(f.patrimonio),
    liquidos: n(f.liquidos),
    ingresoPasivoAnual: n(f.ingresoPasivoAnual),
    fecha: f.fecha,
    fx: f.fx ? { USD: f.fx.USD ? new Big(f.fx.USD) : null, EUR: f.fx.EUR ? new Big(f.fx.EUR) : null } : null,
    vivo: false,
  };
}

/**
 * Foto en vivo: la cartera de hoy (más otros activos del registro) menos las deudas del registro único;
 * sin deudas en el registro, los pasivos escritos en el cierre del mes (como antes).
 */
export function fotoViva(ctx: Contexto, m: Mes): FotoCalculada {
  const pos = posicion(ctx);
  const b = ctx.registro ? balance(ctx, ctx.registro) : null;
  const pasivos = b?.hayDeudas ? b.deudas : pasivosDe(ctx.cierres[m]);
  const activos = pos.total.plus(b?.otros ?? 0);
  return {
    activos,
    pasivos,
    patrimonio: activos.minus(pasivos),
    liquidos: pos.liquidos,
    ingresoPasivoAnual: pos.rentaTotal,
    fecha: ctx.hoy,
    fx: { USD: ctx.mercado.fx.USD.valor, EUR: ctx.mercado.fx.EUR.valor },
    vivo: true,
  };
}

/** Foto para guardar al cerrar el mes (cifras en texto). */
export function fotoParaGuardar(f: FotoCalculada): Foto {
  const t = (b: Big) => b.toFixed(2);
  return {
    activos: t(f.activos),
    pasivos: t(f.pasivos),
    patrimonio: t(f.patrimonio),
    liquidos: t(f.liquidos),
    ingresoPasivoAnual: t(f.ingresoPasivoAnual),
    fecha: f.fecha,
    fx: f.fx ? { USD: f.fx.USD ? f.fx.USD.toFixed() : null, EUR: f.fx.EUR ? f.fx.EUR.toFixed() : null } : null,
  };
}

export function mesesConCierre(ctx: Contexto): Mes[] {
  return Object.keys(ctx.cierres).sort();
}

/** El mes «vivo»: el actual, o el último con cierre si alguien cargó meses futuros. */
export function mesActualMax(ctx: Contexto): Mes {
  const k = mesesConCierre(ctx);
  const hoy = ctx.hoy.slice(0, 7);
  return k.length && k[k.length - 1] > hoy ? k[k.length - 1] : hoy;
}

export function fotoDe(ctx: Contexto, m: Mes): FotoCalculada | null {
  const c = ctx.cierres[m];
  if (c?.snap) return desdeFoto(c.snap);
  if (m === mesActualMax(ctx)) return fotoViva(ctx, m);
  return null;
}

/** Última foto congelada en o antes de m. */
export function fotoHasta(ctx: Contexto, m: Mes): { mes: Mes; foto: FotoCalculada } | null {
  const k = mesesConCierre(ctx).filter((x) => x <= m && ctx.cierres[x].snap);
  if (!k.length) return null;
  const mes = k[k.length - 1];
  return { mes, foto: desdeFoto(ctx.cierres[mes].snap!) };
}

/** Promedio del gasto operativo de los últimos 6 cierres con gasto. */
export function gastoPromedio(ctx: Contexto): Big | null {
  const v = mesesConCierre(ctx)
    .slice(-6)
    .map((m) => sumFijos(ctx.p, ctx.cierres[m]).plus(sumVariables(ctx.p, ctx.cierres[m])))
    .filter((x) => x.gt(0));
  return v.length ? suma(v).div(v.length) : null;
}

export interface Indicadores {
  mes: Mes;
  cierre: Cierre | null;
  ing: Big;
  gf: Big;
  gv: Big;
  gOp: Big;
  ap: Big;
  flujo: Big;
  foto: FotoCalculada;
  tc: ResumenTarjetas;
  /** Gasto operativo de referencia: el del mes, o el promedio si el mes no tiene gasto. */
  gastoRef: Big | null;
  ingPasivoMes: Big;
  tasaAhorro: Big | null;
  ratioGasto: Big | null;
  fondoMeses: Big | null;
  coberturaPasiva: Big | null;
  yieldPort: Big | null;
  deudaIngreso: Big | null;
  patLibertad: Big | null;
  efectivoResidual: Big;
}

export function indicadores(ctx: Contexto, m: Mes): Indicadores {
  const c = ctx.cierres[m] ?? null;
  const ing = sumIngresos(ctx.p, c);
  const gf = sumFijos(ctx.p, c);
  const gv = sumVariables(ctx.p, c);
  const ap = sumAportes(ctx.p, c);
  const gOp = gf.plus(gv);
  const flujo = ing.minus(gOp);
  const foto = fotoDe(ctx, m) ?? fotoHasta(ctx, m)?.foto ?? fotoViva(ctx, m);
  const tc = usoTarjetas(ctx.p, c);
  const gastoRef = gOp.gt(0) ? gOp : gastoPromedio(ctx);
  const ingPasivoMes = foto.ingresoPasivoAnual.div(12);
  const ingPos = ing.gt(0);
  const tasaRetiro = n(ctx.p.tasaRetiro);
  return {
    mes: m,
    cierre: c,
    ing,
    gf,
    gv,
    gOp,
    ap,
    flujo,
    foto,
    tc,
    gastoRef,
    ingPasivoMes,
    tasaAhorro: ingPos ? flujo.div(ing) : null,
    ratioGasto: ingPos ? gOp.div(ing) : null,
    fondoMeses: gastoRef && gastoRef.gt(0) ? foto.liquidos.div(gastoRef) : null,
    coberturaPasiva: gastoRef && gastoRef.gt(0) ? ingPasivoMes.div(gastoRef) : null,
    yieldPort: div(foto.ingresoPasivoAnual, foto.activos),
    deudaIngreso: ingPos ? foto.pasivos.div(ing.times(12)) : null,
    patLibertad: gastoRef && tasaRetiro.gt(0) ? gastoRef.times(12).div(tasaRetiro) : null,
    efectivoResidual: flujo.minus(ap),
  };
}

/** Cambio de patrimonio contra la última foto congelada anterior al mes. */
export function cambioDelMes(ctx: Contexto, m: Mes): { previo: Mes; cambio: Big; pct: Big | null } | null {
  const ind = indicadores(ctx, m);
  const prev = fotoHasta(ctx, mesPrevio(m));
  if (!prev) return null;
  const cambio = ind.foto.patrimonio.minus(prev.foto.patrimonio);
  return { previo: prev.mes, cambio, pct: div(cambio, prev.foto.patrimonio.abs()) };
}
