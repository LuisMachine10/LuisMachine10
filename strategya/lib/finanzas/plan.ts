// Plan del mes EN MONTOS (manual, sección C). Reemplaza el reparto del ahorro por porcentajes que decidía el sistema:
//
//   Ingreso + Otros ingresos − Costos − Gastos − Ahorro e inversión − Pagos de tarjetas y préstamos = SOBRANTE
//
//   · El SOBRANTE no se planifica: es lo que queda. Se queda en la cuenta donde entró el dinero o va a efectivo
//     (doble partida: cada movimiento tiene cuenta de origen y de destino).
//   · Orden de distribución de Mena: primero ahorro e inversión, luego la tarjeta (así se muestra).
//   · Cada línea de ahorro e inversión es un fijo del Presupuesto: «Mover entre mis cuentas» con categoría de ahorro e
//     inversión hacia un instrumento EXACTO, con su monto en su moneda. Se marca HECHA cuando se registra la
//     transferencia a ese destino (parcial permitido); al cierre, «más o menos de lo planeado».
//   · Es un plan de caja: los Gastos son los que salen de tu dinero este mes. Las compras con tarjeta no salen de tu
//     dinero hasta que pagas la tarjeta (van en «Pagos de tarjetas y préstamos»), y el interés y los cargos que van
//     dentro de un pago tampoco se restan dos veces. En el estado de resultados (lib/caja/resultados.ts) la compra con
//     tarjeta sí es gasto del mes: ahí manda lo que gastaste, aquí lo que sale de tus cuentas.
// Puro, con big.js. Ninguna cifra sale de aquí que no venga de lo que Mena anotó.

import Big from "big.js";
import { simular, type Simulacion } from "../caja/motor";
import { destinoDe, estadoDeResultados, fijosDelMes } from "../caja/resultados";
import { aDOP, convertir, finDeMes, tasaDeCambio } from "../caja/tasas";
import { type Fecha, type Mes, mesDe, ultimoDia } from "../caja/fechas";
import { type Categoria, type Cuenta, type DatosCaja, type Movimiento, type Recurrente } from "../caja/tipos";

const CERO = new Big(0);

export type EstadoLinea = "hecha" | "parcial" | "pendiente";

export interface LineaAhorro {
  /** El fijo del Presupuesto que es la línea. */
  recurrente: Recurrente;
  /** Cuenta del Presupuesto a donde va (si el instrumento vive en el Presupuesto). */
  cajaId: string | null;
  /** Fila del registro único (instrumento exacto). null si la cuenta del Presupuesto no tiene fila (no debería). */
  registroId: string | null;
  moneda: Recurrente["moneda"];
  /** Veces que cae en el mes. */
  veces: number;
  /** Lo planeado en el mes, en su moneda. */
  planeado: Big;
  /** Lo planeado en RD$ (US$ con el dólar del BCRD al cierre del mes); null sin tasa. */
  planeadoDOP: Big | null;
  /** Lo transferido a ese destino en el mes, en la moneda de la línea. */
  hecho: Big;
  hechoDOP: Big | null;
  estado: EstadoLinea;
  /** hecho − planeado (positivo: más de lo planeado). */
  diferencia: Big;
}

export interface Cifra {
  plan: Big;
  real: Big;
}

export interface PagoPlan {
  fecha: Fecha;
  recurrenteId: string | null;
  nombre: string;
  destino: string | null;
  monto: string;
  moneda: Recurrente["moneda"];
  montoDOP: Big | null;
  /** Ya anotado (movimiento) o todavía planificado. */
  hecho: boolean;
}

export interface PlanDelMes {
  mes: Mes;
  ingresos: Cifra;
  otrosIngresos: Cifra;
  costos: Cifra;
  /** Gastos que salen de tu dinero (sin compras con tarjeta ni el interés/cargos que van dentro de un pago). */
  gastos: Cifra;
  /** Compras con tarjeta del mes (no salen de tu dinero hasta que pagas la tarjeta). */
  conTarjeta: Cifra;
  ahorro: Cifra;
  pagos: Cifra;
  sobrante: Cifra;
  lineas: LineaAhorro[];
  /** Ahorro presupuestado SIN instrumento (monto adicional de una categoría de ahorro): no entra al plan. */
  sinInstrumento: Big;
  /** Ahorro real que no fue a ninguna línea (otro destino o un gasto de ahorro): sí salió de tu dinero. */
  ahorroSuelto: Big;
  pagosDelMes: PagoPlan[];
  /** Montos que no se pudieron pasar a RD$ (US$ sin tasa). */
  sinTasa: number;
}

const mapa = <T extends { id: string }>(xs: readonly T[]) => new Map(xs.map((x) => [x.id, x]));

/** ¿Este fijo es una línea del plan de ahorro? «Mover» hacia un destino de ahorro e inversión (categoría o cuenta de ahorro). */
export function esLineaAhorro(r: Recurrente, categorias: Map<string, Categoria>, cuentas: Map<string, Cuenta>): boolean {
  if (r.tipo !== "transferencia" || !(r.destino || r.registroDestino)) return false;
  return destinoDe(r.tipo, r.categoria, r.destino, categorias, cuentas, r.registroDestino ?? null)?.tipo === "ahorro_inversion";
}

/** Clave del destino de una línea o de un movimiento: la cuenta del Presupuesto o la fila del registro. */
const claveDestino = (x: { destino: string | null; registroDestino?: string | null }) => (x.destino ? `c:${x.destino}` : x.registroDestino ? `r:${x.registroDestino}` : null);

/** Monto de un movimiento en la moneda de la línea (misma moneda: igual; si no, con su tasa o la del BCRD del día). */
function enMonedaDe(m: Movimiento, moneda: Recurrente["moneda"], datos: DatosCaja): Big | null {
  return convertir(new Big(m.monto), m.moneda, moneda, tasaDeCambio(m.tasa, datos.tasasUSD, m.fecha));
}

/**
 * Las líneas del plan de ahorro del mes con lo hecho. Lo hecho de una línea = las transferencias del mes que la
 * confirman (su fijo) + las sueltas hacia el mismo destino, repartidas en orden entre las líneas de ese destino.
 * `enlaces`: cuenta del Presupuesto → fila del registro.
 */
export function lineasDelMes(datos: DatosCaja, mes: Mes, enlaces: Record<string, string> = {}): LineaAhorro[] {
  const categorias = mapa(datos.categorias);
  const cuentas = mapa(datos.cuentas);
  const fijos = new Map(fijosDelMes(datos, mes).map((f) => [f.recurrente.id, f]));
  const delMes = datos.movimientos.filter((m) => mesDe(m.fecha) === mes && m.tipo === "transferencia");
  const lineas: LineaAhorro[] = [];
  for (const r of datos.recurrentes) {
    const f = fijos.get(r.id);
    if (!f || !esLineaAhorro(r, categorias, cuentas)) continue;
    const planeado = new Big(r.monto).times(f.veces);
    const propios = delMes.filter((m) => m.recurrenteId === r.id);
    let hecho = CERO;
    for (const m of propios) hecho = hecho.plus(enMonedaDe(m, r.moneda, datos) ?? CERO);
    lineas.push({
      recurrente: r,
      cajaId: r.destino,
      registroId: r.registroDestino ?? (r.destino ? (enlaces[r.destino] ?? null) : null),
      moneda: r.moneda,
      veces: f.veces,
      planeado,
      planeadoDOP: f.totalDOP === null ? null : new Big(f.totalDOP),
      hecho,
      hechoDOP: null,
      estado: "pendiente",
      diferencia: CERO,
    });
  }
  // Las transferencias sueltas (sin fijo) a un destino con línea: llenan las líneas de ese destino en orden.
  const ids = new Set(lineas.map((l) => l.recurrente.id));
  for (const m of delMes) {
    if (m.recurrenteId && ids.has(m.recurrenteId)) continue;
    const k = claveDestino(m);
    if (!k) continue;
    const delDestino = lineas.filter((l) => claveDestino({ destino: l.cajaId, registroDestino: l.recurrente.registroDestino }) === k);
    if (!delDestino.length) continue;
    let resto = enMonedaDe(m, delDestino[0].moneda, datos) ?? CERO;
    for (let i = 0; i < delDestino.length && resto.gt(0); i++) {
      const l = delDestino[i];
      const falta = l.planeado.minus(l.hecho);
      const pone = i === delDestino.length - 1 || resto.lte(falta) ? resto : falta.gt(0) ? falta : CERO;
      l.hecho = l.hecho.plus(pone);
      resto = resto.minus(pone);
    }
  }
  const fin = finDeMes(mes);
  for (const l of lineas) {
    l.estado = l.hecho.gte(l.planeado) && l.planeado.gt(0) ? "hecha" : l.hecho.gt(0) ? "parcial" : "pendiente";
    l.diferencia = l.hecho.minus(l.planeado);
    l.hechoDOP = aDOP(l.hecho.toFixed(), l.moneda, null, datos.tasasUSD, fin);
  }
  return lineas;
}

/** Aporte de cada instrumento (fila del registro) en cada mes, según las líneas: lo que usan las proyecciones. */
export function aportesPorInstrumento(datos: DatosCaja, mes: Mes, enlaces: Record<string, string> = {}): Map<string, { monto: Big; moneda: Recurrente["moneda"] }> {
  const out = new Map<string, { monto: Big; moneda: Recurrente["moneda"] }>();
  for (const l of lineasDelMes(datos, mes, enlaces)) {
    if (!l.registroId) continue;
    const previo = out.get(l.registroId);
    // Un instrumento lleva una moneda: si dos líneas usan monedas distintas, cuenta la primera (la pantalla lo avisa).
    if (previo && previo.moneda !== l.moneda) continue;
    out.set(l.registroId, { monto: (previo?.monto ?? CERO).plus(l.planeado), moneda: l.moneda });
  }
  return out;
}

const mesesEntre = (a: Mes, b: Mes) => {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
};
const sumarMes = (m: Mes, k: number): Mes => {
  const [y, mm] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mm - 1 + k, 1));
  return d.toISOString().slice(0, 7);
};

/**
 * Lo que usan las proyecciones: por instrumento (fila del registro), el aporte mensual de sus líneas del plan, en su
 * moneda, desde el mes en que empieza la línea (1 = el cierre de este mes) y hasta el mes en que termina. Una línea
 * que empieza más adelante se cuenta desde su primer mes (con las veces que cae en ese mes).
 */
export function aportesProyeccion(
  datos: DatosCaja,
  hoy: Fecha,
  enlaces: Record<string, string> = {},
): Map<string, { monto: Big; moneda: Recurrente["moneda"]; desdeMes: number; hastaMes: number | null }> {
  const out = new Map<string, { monto: Big; moneda: Recurrente["moneda"]; desdeMes: number; hastaMes: number | null }>();
  const categorias = mapa(datos.categorias);
  const cuentas = mapa(datos.cuentas);
  const actual = mesDe(hoy);
  for (const r of datos.recurrentes) {
    if (!r.activo || !esLineaAhorro(r, categorias, cuentas)) continue;
    if (r.hasta && mesDe(r.hasta) < actual) continue;
    const primero = r.desde && mesDe(r.desde) > actual ? mesDe(r.desde) : actual;
    // Las veces que cae en su primer mes (o el siguiente, si ya pasó la única fecha de este mes).
    const vecesEn = (m: Mes) => fijosDelMes({ ...datos, recurrentes: [r] }, m).find((f) => f.recurrente.id === r.id)?.veces ?? 0;
    let mes = primero;
    let veces = vecesEn(mes);
    if (!veces) {
      mes = sumarMes(primero, 1);
      veces = vecesEn(mes);
    }
    if (!veces) continue;
    const id = r.registroDestino ?? (r.destino ? enlaces[r.destino] : undefined);
    if (!id) continue;
    const desdeMes = mesesEntre(actual, mes) + 1;
    const hastaMes = r.hasta ? mesesEntre(actual, mesDe(r.hasta)) + 1 : null;
    const previo = out.get(id);
    if (previo && previo.moneda !== r.moneda) continue;
    out.set(id, {
      monto: (previo?.monto ?? CERO).plus(new Big(r.monto).times(veces)),
      moneda: r.moneda,
      desdeMes: previo ? Math.min(previo.desdeMes, desdeMes) : desdeMes,
      hastaMes: previo ? (previo.hastaMes === null || hastaMes === null ? null : Math.max(previo.hastaMes, hastaMes)) : hastaMes,
    });
  }
  return out;
}

/** El plan del mes con la fórmula del manual, plan contra real. `sim` (opcional) debe cubrir el mes. */
export function planDelMes(datos: DatosCaja, mes: Mes, hoy: Fecha, enlaces: Record<string, string> = {}, sim?: Simulacion): PlanDelMes {
  const e = estadoDeResultados(datos, mes);
  const categorias = mapa(datos.categorias);
  const cuentas = mapa(datos.cuentas);
  const s = (t: keyof typeof e.secciones): Cifra => ({ plan: new Big(e.secciones[t].presupuestado), real: new Big(e.secciones[t].real) });
  let sinTasa = e.sinTasa;

  // Compras con tarjeta: fijos y movimientos de gasto (o costo) cuya cuenta es una tarjeta.
  const conTarjeta: Cifra = { plan: CERO, real: CERO };
  const costoTarjeta: Cifra = { plan: CERO, real: CERO };
  const esTarjeta = (id: string | null) => !!id && cuentas.get(id)?.tipo === "tarjeta";
  for (const f of fijosDelMes(datos, mes)) {
    const r = f.recurrente;
    if (r.tipo !== "gasto" || !esTarjeta(r.cuenta) || f.totalDOP === null) continue;
    const d = destinoDe(r.tipo, r.categoria, r.destino, categorias, cuentas);
    if (!d || d.tipo === "ahorro_inversion" || d.tipo === "ingreso" || d.tipo === "otro_ingreso") continue;
    (d.tipo === "costo" ? costoTarjeta : conTarjeta).plan = (d.tipo === "costo" ? costoTarjeta : conTarjeta).plan.plus(new Big(f.totalDOP).times(d.signo));
  }
  // Interés y cargos que van dentro de un pago: ya están en «Pagos», no se restan otra vez como gasto.
  let dentroDePagos = CERO;
  const pagos: Cifra = { plan: CERO, real: CERO };
  for (const m of datos.movimientos) {
    if (mesDe(m.fecha) !== mes) continue;
    const dop = aDOP(m.monto, m.moneda, m.tasa, datos.tasasUSD, m.fecha);
    if (m.tipo === "gasto" && esTarjeta(m.cuenta)) {
      const d = destinoDe(m.tipo, m.categoria, m.destino, categorias, cuentas);
      if (dop && d && d.tipo !== "ahorro_inversion" && d.tipo !== "ingreso" && d.tipo !== "otro_ingreso") {
        const c = d.tipo === "costo" ? costoTarjeta : conTarjeta;
        c.real = c.real.plus(dop.times(d.signo));
      }
    }
    if (m.tipo === "pago_tarjeta") {
      if (dop) pagos.real = pagos.real.plus(dop);
      for (const x of [m.interes, m.cargos]) if (x && new Big(x).gt(0)) dentroDePagos = dentroDePagos.plus(aDOP(x, m.moneda, m.tasa, datos.tasasUSD, m.fecha) ?? CERO);
    }
  }

  // Pagos planificados del mes: los fijos de pago (un «pagar todo» toma lo que se debe ese día, de la simulación).
  const simu = sim ?? (datos.config ? simular(datos, { hoy, hasta: ultimoDia(mes) > hoy ? ultimoDia(mes) : hoy }) : null);
  const pagosDelMes: PagoPlan[] = [];
  for (const d of simu?.dias ?? []) {
    if (mesDe(d.fecha) !== mes) continue;
    for (const o of [...d.planificados, ...d.porConfirmar]) {
      if (o.tipo !== "pago_tarjeta") continue;
      const dop = o.montoDOP === null ? null : new Big(o.montoDOP);
      if (dop) pagos.plan = pagos.plan.plus(dop);
      else sinTasa++;
      pagosDelMes.push({ fecha: d.fecha, recurrenteId: o.recurrenteId, nombre: o.nombre, destino: o.destino, monto: o.monto, moneda: o.moneda, montoDOP: dop, hecho: false });
    }
    for (const m of d.registrados) {
      if (m.tipo !== "pago_tarjeta") continue;
      const dop = m.montoDOP === null ? null : new Big(m.montoDOP);
      // Un fijo confirmado cuenta como planeado con lo que se pagó.
      if (m.recurrenteId && dop) pagos.plan = pagos.plan.plus(dop);
      pagosDelMes.push({ fecha: d.fecha, recurrenteId: m.recurrenteId, nombre: m.nota ?? "Pago", destino: m.destino, monto: m.monto, moneda: m.moneda, montoDOP: dop, hecho: true });
    }
  }

  const lineas = lineasDelMes(datos, mes, enlaces);
  const ahorro: Cifra = { plan: CERO, real: CERO };
  for (const l of lineas) {
    if (l.planeadoDOP) ahorro.plan = ahorro.plan.plus(l.planeadoDOP);
    else sinTasa++;
    if (l.hechoDOP) ahorro.real = ahorro.real.plus(l.hechoDOP);
  }
  // Lo presupuestado para ahorro que no es una línea (monto adicional sin instrumento) no entra al plan; lo real que
  // no fue a una línea sí salió de tu dinero.
  const sec = e.secciones.ahorro_inversion;
  const sinInstrumento = new Big(sec.presupuestado).minus(lineas.reduce((t, l) => t.plus(l.planeadoDOP ?? CERO), CERO));
  const ahorroSuelto = new Big(sec.real).minus(ahorro.real);
  if (ahorroSuelto.gt(0)) ahorro.real = ahorro.real.plus(ahorroSuelto);

  const ingresos = s("ingreso");
  const otrosIngresos = s("otro_ingreso");
  const costos = { plan: s("costo").plan.minus(costoTarjeta.plan), real: s("costo").real.minus(costoTarjeta.real) };
  const brutos = {
    plan: s("gasto").plan.plus(s("gasto_financiero").plan).plus(s("otro_gasto").plan),
    real: s("gasto").real.plus(s("gasto_financiero").real).plus(s("otro_gasto").real),
  };
  const gastos = { plan: brutos.plan.minus(conTarjeta.plan), real: brutos.real.minus(conTarjeta.real).minus(dentroDePagos) };
  const sobrante = (k: keyof Cifra) => ingresos[k].plus(otrosIngresos[k]).minus(costos[k]).minus(gastos[k]).minus(ahorro[k]).minus(pagos[k]);
  return {
    mes,
    ingresos,
    otrosIngresos,
    costos,
    gastos,
    conTarjeta: { plan: conTarjeta.plan.plus(costoTarjeta.plan), real: conTarjeta.real.plus(costoTarjeta.real) },
    ahorro,
    pagos,
    sobrante: { plan: sobrante("plan"), real: sobrante("real") },
    lineas,
    sinInstrumento: sinInstrumento.gt(0) ? sinInstrumento : CERO,
    ahorroSuelto: ahorroSuelto.gt(0) ? ahorroSuelto : CERO,
    pagosDelMes,
    sinTasa,
  };
}

/** «RD$ 1,200 más de lo planeado» / «menos» / «justo lo planeado» (al cierre del mes). */
export function masOMenos(diferencia: Big): "mas" | "menos" | "igual" {
  return diferencia.gt(0) ? "mas" : diferencia.lt(0) ? "menos" : "igual";
}
