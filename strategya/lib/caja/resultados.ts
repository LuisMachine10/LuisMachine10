// Estado de resultados del mes: lo presupuestado (fijos del mes + adicional de cada categoría) contra
// lo real (movimientos anotados o confirmados), línea por línea:
//
//   Ingresos − Costos = Utilidad bruta
//   − Gastos = Utilidad operativa
//   − Gastos financieros + Otros ingresos − Otros gastos = UTILIDAD NETA
//   Destino de la utilidad: Ahorro e inversión (va al Portafolio) → Te queda disponible.
//
// La categoría es la única fuente: un pago fijo o un movimiento cae en la línea de su categoría. Lo que
// no tiene categoría no se pierde: cae en «Sin categoría» de Ingresos o de Gastos (y se avisa).
// La función SQL personal.resultado_mes (migración 20261021000400_presupuesto.sql) hace la misma cuenta
// con las mismas reglas; las pruebas de base comparan las dos.
//
// Puro y con big.js: ningún monto pasa por float.

import Big from "big.js";
import { diasDeRecurrente, ocurreEn, type Simulacion } from "./motor";
import { aDOP, finDeMes, type TasaUsada, tasaPara } from "./tasas";
import { type Mes, mesDe, primerDia, rangoFechas, ultimoDia } from "./fechas";
import {
  type Categoria,
  type Cuenta,
  type DatosCaja,
  esEntrada,
  NOMBRE_TIPO_CATEGORIA,
  type Recurrente,
  type TipoCategoria,
  type TipoMovimiento,
  TIPOS_CATEGORIA,
} from "./tipos";

const CERO = new Big(0);

/** Claves de las líneas que no son una categoría de Mena. */
export const SIN_CATEGORIA_INGRESO = "__sin_categoria_ingreso";
export const SIN_CATEGORIA_GASTO = "__sin_categoria_gasto";
export const A_CUENTAS_DE_AHORRO = "__a_cuentas_de_ahorro";
/** Interés de pagos de tarjeta o préstamo sin categoría de gasto financiero. */
export const INTERESES_DEUDAS = "__intereses_deudas";

/**
 * Línea de la parte de interés de un pago de tarjeta o préstamo: su categoría si es de gasto financiero;
 * si no, «Intereses de tus deudas». Siempre gasto financiero.
 */
export function destinoInteres(categoria: string | null, categorias: Map<string, Categoria>): Destino {
  const cat = categoria ? categorias.get(categoria) : undefined;
  return cat?.tipo === "gasto_financiero" ? { clave: cat.id, tipo: "gasto_financiero", signo: 1 } : { clave: INTERESES_DEUDAS, tipo: "gasto_financiero", signo: 1 };
}

export interface Destino {
  /** Id de la categoría o una de las claves especiales de arriba. */
  clave: string;
  tipo: TipoCategoria;
  /** +1 si suma a la línea, −1 si resta (un reembolso en un gasto, por ejemplo). */
  signo: 1 | -1;
}

/**
 * ¿En qué línea cae un monto? Ingreso y gasto van a su categoría (o a «Sin categoría»). Mover entre
 * cuentas y pagar la tarjeta no son ni ingreso ni gasto: solo cuentan si van a ahorro e inversión (por
 * su categoría o porque el destino es una cuenta de ahorro). Lo demás no entra al estado (null).
 */
export function destinoDe(
  tipo: TipoMovimiento,
  categoria: string | null,
  destino: string | null,
  categorias: Map<string, Categoria>,
  cuentas: Map<string, Cuenta>,
): Destino | null {
  const cat = categoria ? categorias.get(categoria) : undefined;
  if (tipo === "transferencia" || tipo === "pago_tarjeta") {
    if (cat?.tipo === "ahorro_inversion") return { clave: cat.id, tipo: "ahorro_inversion", signo: 1 };
    if (!cat && destino && cuentas.get(destino)?.tipo === "ahorro") return { clave: A_CUENTAS_DE_AHORRO, tipo: "ahorro_inversion", signo: 1 };
    return null;
  }
  if (!cat) return tipo === "ingreso" ? { clave: SIN_CATEGORIA_INGRESO, tipo: "ingreso", signo: 1 } : { clave: SIN_CATEGORIA_GASTO, tipo: "gasto", signo: 1 };
  const entra = tipo === "ingreso";
  return { clave: cat.id, tipo: cat.tipo, signo: esEntrada(cat.tipo) === entra ? 1 : -1 };
}

// ───────────────────────── Fijos del mes ─────────────────────────

export interface FijoDelMes {
  recurrente: Recurrente;
  /** Veces que ocurre en el mes. */
  veces: number;
  /** Total del mes en RD$; null si es US$ sin tasa o «pagar todo lo que debas» (no se sabe de antemano). */
  totalDOP: string | null;
}

/** Cada recurrente activo con las veces que cae en el mes y su total en RD$ (lo planificado, no lo real). */
export function fijosDelMes(datos: DatosCaja, mes: Mes): FijoDelMes[] {
  const dias = rangoFechas(primerDia(mes), ultimoDia(mes));
  const inicio = datos.config?.inicio ?? null;
  const r: FijoDelMes[] = [];
  for (const rec of datos.recurrentes) {
    // «Cada N días» se cuenta desde «desde» o desde el inicio del calendario; sin ninguno, no hay base.
    if (rec.frecuencia === "cada_n" && !rec.desde && !inicio) continue;
    const base = inicio ?? rec.desde!;
    const veces = dias.filter((d) => ocurreEn(rec, d, base)).length;
    if (!veces) continue;
    let totalDOP: string | null = null;
    if (!(rec.tipo === "pago_tarjeta" && rec.pagoTotal)) {
      // US$: el dólar del BCRD al cierre del mes (o el de hoy, si el mes no ha terminado).
      const uno = aDOP(rec.monto, rec.moneda, null, datos.tasasUSD, finDeMes(mes));
      totalDOP = uno ? uno.times(veces).toString() : null;
    }
    r.push({ recurrente: rec, veces, totalDOP });
  }
  return r;
}

// ───────────────────────── Estado de resultados ─────────────────────────

export interface Cifras {
  presupuestado: string;
  real: string;
  /** Siempre «a favor» positivo: en ingresos, utilidades y ahorro = real − presupuestado; en costos y gastos = presupuestado − real. */
  diferencia: string;
  /** real ÷ presupuestado × 100, entero. null si lo presupuestado es 0 o negativo. */
  cumplimiento: string | null;
}

export interface LineaResultado extends Cifras {
  clave: string;
  nombre: string;
  tipo: TipoCategoria;
  /** Es una línea de «Sin categoría» (o de transferencias a cuentas de ahorro sin categoría). */
  especial: boolean;
  /** Suma de los fijos del mes de esta categoría (RD$). */
  fijos: string;
  /** Monto adicional que escribió Mena. */
  adicional: string;
  /** Lo programado de hoy al fin del mes que todavía no se ha hecho (si se pasó la simulación). */
  pendiente: string;
}

export interface SeccionResultado extends Cifras {
  tipo: TipoCategoria;
  nombre: string;
  lineas: LineaResultado[];
}

export interface EstadoResultados {
  mes: Mes;
  secciones: Record<TipoCategoria, SeccionResultado>;
  utilidadBruta: Cifras;
  utilidadOperativa: Cifras;
  utilidadNeta: Cifras;
  /** Costos + gastos + gastos financieros + otros gastos (el ahorro no es gasto: es destino de la utilidad). */
  gastosTotales: Cifras;
  /** Utilidad neta − ahorro e inversión. */
  disponible: Cifras;
  /** Montos que no se pudieron pasar a RD$ (US$ sin tasa) y fijos de «pagar todo lo que debas». */
  sinTasa: number;
  /** Movimientos del mes en US$ con la tasa que se usó (null = no confirmado: no se sumaron). */
  conversiones: { id: string; fecha: string; monto: string; tasa: TasaUsada | null; dop: string | null }[];
  /** Fijos y movimientos del mes sin categoría (caen en «Sin categoría»). */
  sinCategoria: { recurrentes: number; movimientos: number };
  /** No hay nada presupuestado ni real en el mes. */
  vacio: boolean;
}

/** Se suman a favor si suben (ingresos, utilidades, ahorro). */
function subeAFavor(t: TipoCategoria | "utilidad"): boolean {
  return t === "utilidad" || esEntrada(t) || t === "ahorro_inversion";
}

export function cifras(presupuestado: Big, real: Big, tipo: TipoCategoria | "utilidad"): Cifras {
  const diferencia = subeAFavor(tipo) ? real.minus(presupuestado) : presupuestado.minus(real);
  return {
    presupuestado: presupuestado.toString(),
    real: real.toString(),
    diferencia: diferencia.toString(),
    cumplimiento: presupuestado.gt(0) ? real.div(presupuestado).times(100).round(0, Big.roundHalfUp).toString() : null,
  };
}

const NOMBRE_ESPECIAL: Record<string, string> = {
  [SIN_CATEGORIA_INGRESO]: "Sin categoría",
  [SIN_CATEGORIA_GASTO]: "Sin categoría",
  [A_CUENTAS_DE_AHORRO]: "Pasado a tus cuentas de ahorro",
  [INTERESES_DEUDAS]: "Intereses de tus deudas",
};

export function estadoDeResultados(datos: DatosCaja, mes: Mes, opciones: { sim?: Simulacion } = {}): EstadoResultados {
  const categorias = new Map(datos.categorias.map((c) => [c.id, c]));
  const cuentas = new Map(datos.cuentas.map((c) => [c.id, c]));
  const fijos = new Map<string, Big>();
  const reales = new Map<string, Big>();
  const pendientes = new Map<string, Big>();
  const tipoEspecial = new Map<string, TipoCategoria>();
  let sinTasa = 0;
  let recSinCat = 0;
  let movSinCat = 0;
  const sumar = (m: Map<string, Big>, d: Destino, monto: Big) => {
    if (d.clave.startsWith("__")) tipoEspecial.set(d.clave, d.tipo);
    m.set(d.clave, (m.get(d.clave) ?? CERO).plus(d.signo === 1 ? monto : monto.times(-1)));
  };
  const pide = (tipo: TipoMovimiento, cat: string | null) => (tipo === "ingreso" || tipo === "gasto") && !(cat && categorias.has(cat));

  for (const f of fijosDelMes(datos, mes)) {
    const r = f.recurrente;
    if (pide(r.tipo, r.categoria)) recSinCat++;
    const d = destinoDe(r.tipo, r.categoria, r.destino, categorias, cuentas);
    if (!d) continue;
    if (f.totalDOP == null) {
      sinTasa++;
      continue;
    }
    sumar(fijos, d, new Big(f.totalDOP));
  }

  const conversiones: EstadoResultados["conversiones"] = [];
  for (const m of datos.movimientos) {
    if (mesDe(m.fecha) !== mes) continue;
    const dop = aDOP(m.monto, m.moneda, m.tasa, datos.tasasUSD, m.fecha);
    if (m.moneda === "USD") conversiones.push({ id: m.id, fecha: m.fecha, monto: m.monto, tasa: tasaPara(m.moneda, m.tasa, datos.tasasUSD, m.fecha), dop: dop ? dop.toString() : null });
    // La parte de interés de un pago de tarjeta o préstamo: gasto financiero del mes.
    if (m.tipo === "pago_tarjeta" && m.interes && new Big(m.interes).gt(0)) {
      const i = aDOP(m.interes, m.moneda, m.tasa, datos.tasasUSD, m.fecha);
      if (i) sumar(reales, destinoInteres(m.categoria, categorias), i);
      else sinTasa++;
    }
    const d = destinoDe(m.tipo, m.categoria, m.destino, categorias, cuentas);
    if (!d) continue;
    if (pide(m.tipo, m.categoria)) movSinCat++;
    if (!dop) {
      sinTasa++;
      continue;
    }
    sumar(reales, d, dop);
  }

  const sim = opciones.sim;
  if (sim) {
    for (const dia of sim.dias) {
      if (mesDe(dia.fecha) !== mes || dia.fecha < sim.hoy) continue;
      for (const o of dia.planificados) {
        const d = destinoDe(o.tipo, o.categoria, o.destino, categorias, cuentas);
        if (d && o.montoDOP != null) sumar(pendientes, d, new Big(o.montoDOP));
      }
    }
  }

  const secciones = {} as Record<TipoCategoria, SeccionResultado>;
  for (const t of TIPOS_CATEGORIA) {
    const lineas: LineaResultado[] = [];
    const agregar = (clave: string, nombre: string, adicional: Big, especial: boolean) => {
      const fi = fijos.get(clave) ?? CERO;
      const p = fi.plus(adicional);
      const r = reales.get(clave) ?? CERO;
      lineas.push({
        clave, nombre, tipo: t, especial,
        fijos: fi.toString(), adicional: adicional.toString(), pendiente: (pendientes.get(clave) ?? CERO).toString(),
        ...cifras(p, r, t),
      });
    };
    for (const c of datos.categorias) if (c.tipo === t) agregar(c.id, c.nombre, new Big(c.adicional ?? "0"), false);
    for (const [clave, tipo] of tipoEspecial) {
      if (tipo !== t) continue;
      const algo = !(fijos.get(clave) ?? CERO).eq(0) || !(reales.get(clave) ?? CERO).eq(0) || !(pendientes.get(clave) ?? CERO).eq(0);
      if (algo) agregar(clave, NOMBRE_ESPECIAL[clave], CERO, true);
    }
    const p = lineas.reduce((s, l) => s.plus(l.presupuestado), CERO);
    const r = lineas.reduce((s, l) => s.plus(l.real), CERO);
    secciones[t] = { tipo: t, nombre: NOMBRE_TIPO_CATEGORIA[t], lineas, ...cifras(p, r, t) };
  }

  const v = (t: TipoCategoria, k: "presupuestado" | "real") => new Big(secciones[t][k]);
  const calc = (k: "presupuestado" | "real") => {
    const ub = v("ingreso", k).minus(v("costo", k));
    const uo = ub.minus(v("gasto", k));
    const un = uo.minus(v("gasto_financiero", k)).plus(v("otro_ingreso", k)).minus(v("otro_gasto", k));
    const gt = v("costo", k).plus(v("gasto", k)).plus(v("gasto_financiero", k)).plus(v("otro_gasto", k));
    return { ub, uo, un, gt, disp: un.minus(v("ahorro_inversion", k)) };
  };
  const p = calc("presupuestado");
  const r = calc("real");
  const vacio = TIPOS_CATEGORIA.every((t) => secciones[t].lineas.every((l) => new Big(l.presupuestado).eq(0) && new Big(l.real).eq(0)));

  return {
    mes,
    secciones,
    utilidadBruta: cifras(p.ub, r.ub, "utilidad"),
    utilidadOperativa: cifras(p.uo, r.uo, "utilidad"),
    utilidadNeta: cifras(p.un, r.un, "utilidad"),
    gastosTotales: cifras(p.gt, r.gt, "gasto"),
    disponible: cifras(p.disp, r.disp, "utilidad"),
    sinTasa,
    conversiones,
    sinCategoria: { recurrentes: recSinCat, movimientos: movSinCat },
    vacio,
  };
}

/** Lo presupuestado de las categorías de ahorro e inversión del mes (lo que va al Portafolio). */
export function presupuestoAhorroMensual(datos: DatosCaja, mes: Mes): string {
  return estadoDeResultados(datos, mes).secciones.ahorro_inversion.presupuestado;
}

// ───────────────────────── Conversión de la versión anterior ─────────────────────────

/**
 * Antes, el «presupuesto» de una categoría era el total del mes. Ahora lo presupuestado = fijos + adicional,
 * así que al convertir se descuenta lo que ya ponen sus fijos mensuales en RD$ (monto × días distintos
 * del mes), sin bajar de 0. La migración SQL hace lo mismo. Sin presupuesto (o 0) → null.
 */
export function adicionalDesdeV1(presupuesto: string | null, fijosDeLaCategoria: Recurrente[]): string | null {
  if (presupuesto == null) return null;
  const p = new Big(presupuesto);
  if (p.lte(0)) return null;
  const mensual = fijosDeLaCategoria
    .filter((r) => r.activo && r.frecuencia === "mensual" && r.moneda === "DOP" && !r.pagoTotal && (r.tipo === "ingreso" || r.tipo === "gasto"))
    .reduce((s, r) => s.plus(new Big(r.monto).times(new Set(diasDeRecurrente(r.dias)).size)), CERO);
  const a = p.minus(mensual);
  return a.gt(0) ? a.toString() : null;
}

/** Ancho de una barra en % (solo para dibujar; las cifras se muestran exactas). Tope 100. */
export function anchoBarra(parte: string, total: string): number {
  const t = new Big(total);
  if (t.lte(0)) return 0;
  const v = new Big(parte).div(t).times(100);
  return Math.min(100, Math.max(0, Number(v.toFixed(1))));
}
