// Motor del Calendario de Caja: simulación día a día del flujo de caja de Mena.
//
// Porta la lógica del artefacto «Calendario de Caja» con el mismo comportamiento:
//   · Ocurrencias de recurrentes: días fijos del mes (el 31 cae el último día del mes), cada N días
//     contados desde «desde» (o desde el inicio) y única.
//   · La simulación arranca en config.inicio con los saldos iniciales (tarjeta = deuda, posición negativa).
//   · Cada día: primero los movimientos registrados, luego los recurrentes que tocan ese día:
//       - ya confirmados ese día (un movimiento con su recurrenteId) → nada (el registrado ya se aplicó);
//       - omitidos → se listan como omitidos;
//       - desde hoy en adelante → planificados y se APLICAN;
//       - antes de hoy sin confirmar → «por confirmar» y NO se aplican.
//     Pago total de tarjeta: el monto es lo que se debe en la tarjeta destino en ese momento.
//   · Saldos reales («cuadrar con tu banco») reemplazan la posición de la cuenta y dejan la diferencia.
//   · Disponible = banco + efectivo. Estado: bajo el colchón · cerca del colchón (colchón + margen) · holgado.
//
// Diferencia deliberada con el artefacto: allí, sin tasa general, el US$ se convertía a 60. Aquí no se
// inventa una tasa: un monto en US$ sin tasa propia ni general no se aplica y se avisa.
// Todo con big.js; ningún monto pasa por float.

import Big from "big.js";
import { type Fecha, diasDelMes, diasEntre, esFecha, mesDe, rangoFechas, sumarDias, ultimoDia, type Mes } from "./fechas";
import {
  type ConfigCaja,
  type Cuenta,
  type DatosCaja,
  type Moneda,
  type Movimiento,
  type Recurrente,
  type TipoMovimiento,
} from "./tipos";

export type EstadoDia = "holgado" | "cerca" | "bajo";

export const NOMBRE_ESTADO: Record<EstadoDia, string> = {
  holgado: "Holgado",
  cerca: "Cerca del colchón",
  bajo: "Bajo el colchón",
};

/** Días que se simulan más allá de hoy, como en el artefacto. */
export const DIAS_HORIZONTE = 62;

export interface Ocurrencia {
  recurrenteId: string;
  nombre: string;
  tipo: TipoMovimiento;
  /** Monto en su moneda original (en pago total, lo adeudado en RD$). */
  monto: string;
  moneda: Moneda;
  /** Monto en RD$; null si es US$ sin tasa. */
  montoDOP: string | null;
  cuenta: string | null;
  destino: string | null;
  categoria: string | null;
  pagoTotal: boolean;
}

export interface MovimientoAplicado extends Movimiento {
  montoDOP: string | null;
}

export interface AjusteSaldo {
  cuentaId: string;
  /** Lo que dijo el banco (en tarjeta, la deuda). */
  real: string;
  /** Lo que esperaba la simulación, en los mismos términos. */
  esperado: string;
  /** real − esperado. */
  diferencia: string;
}

export interface DiaSimulado {
  fecha: Fecha;
  entradas: string;
  salidas: string;
  /** Lo transferido a cuentas de ahorro ese día. */
  ahorro: string;
  registrados: MovimientoAplicado[];
  planificados: Ocurrencia[];
  porConfirmar: Ocurrencia[];
  omitidos: Ocurrencia[];
  ajustes: AjusteSaldo[];
  /** Posición de cada cuenta al cierre del día (tarjeta negativa = deuda). */
  posiciones: Record<string, string>;
  disponible: string;
  ahorroTotal: string;
  deuda: string;
  estado: EstadoDia;
  nota: string | null;
  tieneIngreso: boolean;
}

export interface Simulacion {
  inicio: Fecha;
  hoy: Fecha;
  hasta: Fecha;
  dias: DiaSimulado[];
  porFecha: Map<Fecha, DiaSimulado>;
  advertencias: string[];
}

const CERO = new Big(0);

export function esEfectivo(c: Cuenta | undefined): boolean {
  return !!c && (c.tipo === "banco" || c.tipo === "efectivo");
}

/** Convierte a RD$. US$: tasa propia, o la general. Sin ninguna → null (no se inventa). */
export function aDOP(monto: string, moneda: Moneda, tasa: string | null, config: ConfigCaja | null): Big | null {
  const m = new Big(monto);
  if (moneda !== "USD") return m;
  const propia = tasa && !new Big(tasa).eq(0) ? tasa : null;
  const general = config?.tasaUSD && !new Big(config.tasaUSD).eq(0) ? config.tasaUSD : null;
  const t = propia ?? general;
  return t ? m.times(t) : null;
}

/** Días del mes de un recurrente mensual: "15, 30" → [15, 30]. Ignora lo que no esté entre 1 y 31. */
export function diasDeRecurrente(dias: string): number[] {
  return String(dias ?? "")
    .split(/[,\s]+/)
    .map((x) => (/^\d+/.test(x) ? Number.parseInt(x, 10) : Number.NaN))
    .filter((x) => x >= 1 && x <= 31);
}

/** ¿El recurrente ocurre en la fecha d? */
export function ocurreEn(r: Recurrente, d: Fecha, inicio: Fecha): boolean {
  if (r.activo === false) return false;
  if (r.desde && d < r.desde) return false;
  if (r.hasta && d > r.hasta) return false;
  const f = r.frecuencia || "mensual";
  if (f === "unica") return r.fecha === d;
  if (f === "cada_n") {
    const n = Math.max(1, Math.round(r.cadaN || 1));
    const base = r.desde || inicio;
    if (d < base) return false;
    return diasEntre(base, d) % n === 0;
  }
  const [a, m, dd] = d.split("-").map(Number);
  const ultimo = diasDelMes(a, m);
  return diasDeRecurrente(r.dias).some((x) => Math.min(x, ultimo) === dd);
}

/** Último día que hay que simular para ver el mes: fin del mes o hoy + 62, lo que sea más tarde. */
export function horizonte(mesVisible: Mes, hoy: Fecha): Fecha {
  const fin = ultimoDia(mesVisible);
  const lejos = sumarDias(hoy, DIAS_HORIZONTE);
  return fin > lejos ? fin : lejos;
}

function estadoDe(disponible: Big, config: ConfigCaja): EstadoDia {
  const colchon = new Big(config.colchon);
  if (disponible.lt(colchon)) return "bajo";
  if (disponible.lt(colchon.plus(config.margen))) return "cerca";
  return "holgado";
}

export function simular(datos: DatosCaja, opciones: { hoy: Fecha; hasta: Fecha }): Simulacion {
  const { config } = datos;
  const { hoy, hasta } = opciones;
  const advertencias: string[] = [];
  if (!config || !esFecha(config.inicio)) {
    return { inicio: hoy, hoy, hasta, dias: [], porFecha: new Map(), advertencias: ["Falta la fecha de inicio en Ajustes."] };
  }
  const inicio = config.inicio;
  const cuentas = new Map(datos.cuentas.map((c) => [c.id, c]));
  const pos = new Map<string, Big>();
  for (const c of datos.cuentas) {
    const s = new Big(c.saldoInicial || "0");
    pos.set(c.id, c.tipo === "tarjeta" ? s.times(-1) : s);
  }

  const movPorDia = agrupar(datos.movimientos, (m) => m.fecha);
  const omitPorDia = agrupar(datos.omitidos, (o) => o.fecha);
  const saldosPorDia = agrupar(datos.saldos, (s) => s.fecha);
  const notas = new Map(datos.notas.map((n) => [n.fecha, n.nota]));
  const sinTasa = new Set<string>();

  const dias: DiaSimulado[] = [];
  const porFecha = new Map<Fecha, DiaSimulado>();
  if (hasta < inicio) return { inicio, hoy, hasta, dias, porFecha, advertencias };

  for (const d of rangoFechas(inicio, hasta)) {
    let entradas = CERO;
    let salidas = CERO;
    let ahorro = CERO;
    let tieneIngreso = false;

    const aplicar = (tipo: TipoMovimiento, m: Big, cuenta: string | null, destino: string | null) => {
      if (tipo === "ingreso") {
        if (cuenta && pos.has(cuenta)) pos.set(cuenta, pos.get(cuenta)!.plus(m));
        entradas = entradas.plus(m);
      } else if (tipo === "gasto") {
        if (cuenta && pos.has(cuenta)) pos.set(cuenta, pos.get(cuenta)!.minus(m));
        salidas = salidas.plus(m);
      } else {
        if (cuenta && pos.has(cuenta)) pos.set(cuenta, pos.get(cuenta)!.minus(m));
        if (destino && pos.has(destino)) pos.set(destino, pos.get(destino)!.plus(m));
        if (destino && cuentas.get(destino)?.tipo === "ahorro") ahorro = ahorro.plus(m);
      }
    };

    const registrados: MovimientoAplicado[] = [];
    for (const it of movPorDia.get(d) ?? []) {
      const m = aDOP(it.monto, it.moneda, it.tasa, config);
      if (m) aplicar(it.tipo, m, it.cuenta, it.destino);
      else sinTasa.add(`${d} · movimiento registrado en US$`);
      if (it.tipo === "ingreso") tieneIngreso = true;
      registrados.push({ ...it, montoDOP: m ? m.toString() : null });
    }

    const confirmados = new Set(registrados.map((r) => r.recurrenteId).filter(Boolean));
    const omitidosHoy = new Set((omitPorDia.get(d) ?? []).map((o) => o.recurrenteId));
    const planificados: Ocurrencia[] = [];
    const porConfirmar: Ocurrencia[] = [];
    const omitidos: Ocurrencia[] = [];

    for (const r of datos.recurrentes) {
      if (!ocurreEn(r, d, inicio)) continue;
      if (confirmados.has(r.id)) continue;
      let monto = r.monto;
      let moneda = r.moneda;
      if (r.tipo === "pago_tarjeta" && r.pagoTotal) {
        const debe = r.destino && pos.has(r.destino) ? pos.get(r.destino)!.times(-1) : CERO;
        monto = (debe.gt(0) ? debe : CERO).toString();
        moneda = "DOP";
      }
      const dop = aDOP(monto, moneda, null, config);
      const oc: Ocurrencia = {
        recurrenteId: r.id,
        nombre: r.nombre,
        tipo: r.tipo,
        monto,
        moneda,
        montoDOP: dop ? dop.toString() : null,
        cuenta: r.cuenta,
        destino: r.destino,
        categoria: r.categoria,
        pagoTotal: r.tipo === "pago_tarjeta" && r.pagoTotal,
      };
      if (omitidosHoy.has(r.id)) {
        omitidos.push(oc);
        continue;
      }
      if (d >= hoy) {
        if (dop) aplicar(r.tipo, dop, r.cuenta, r.destino);
        else sinTasa.add(`${d} · ${r.nombre}`);
        if (r.tipo === "ingreso") tieneIngreso = true;
        planificados.push(oc);
      } else {
        porConfirmar.push(oc);
      }
    }

    const ajustes: AjusteSaldo[] = [];
    for (const s of saldosPorDia.get(d) ?? []) {
      const c = cuentas.get(s.cuentaId);
      if (!c) continue;
      const anterior = pos.get(c.id)!;
      const real = new Big(s.saldo);
      const esTarjeta = c.tipo === "tarjeta";
      const esperado = esTarjeta ? anterior.times(-1) : anterior;
      pos.set(c.id, esTarjeta ? real.times(-1) : real);
      ajustes.push({ cuentaId: c.id, real: real.toString(), esperado: esperado.toString(), diferencia: real.minus(esperado).toString() });
    }

    let disponible = CERO;
    let ahorroTotal = CERO;
    let deuda = CERO;
    const posiciones: Record<string, string> = {};
    for (const c of datos.cuentas) {
      const p = pos.get(c.id)!;
      posiciones[c.id] = p.toString();
      if (esEfectivo(c)) disponible = disponible.plus(p);
      else if (c.tipo === "ahorro") ahorroTotal = ahorroTotal.plus(p);
      else if (c.tipo === "tarjeta" && p.lt(0)) deuda = deuda.minus(p);
    }

    const dia: DiaSimulado = {
      fecha: d,
      entradas: entradas.toString(),
      salidas: salidas.toString(),
      ahorro: ahorro.toString(),
      registrados,
      planificados,
      porConfirmar,
      omitidos,
      ajustes,
      posiciones,
      disponible: disponible.toString(),
      ahorroTotal: ahorroTotal.toString(),
      deuda: deuda.toString(),
      estado: estadoDe(disponible, config),
      nota: notas.get(d) ?? null,
      tieneIngreso,
    };
    dias.push(dia);
    porFecha.set(d, dia);
  }

  if (sinTasa.size) {
    advertencias.push(
      `Hay ${sinTasa.size} monto(s) en US$ sin tasa propia ni tasa general: no se aplicaron. Pon la tasa US$ en Ajustes.`,
    );
  }
  return { inicio, hoy, hasta, dias, porFecha, advertencias };
}

function agrupar<T>(lista: T[], clave: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of lista) {
    const k = clave(x);
    const l = m.get(k);
    if (l) l.push(x);
    else m.set(k, [x]);
  }
  return m;
}

// ───────────────────────── Resumen (tiles de arriba) ─────────────────────────

export interface ResumenCalculado {
  /** null si no hay días simulados desde hoy. */
  puedesGastar: { monto: string; hasta: Fecha | null; diaMinimo: Fecha } | null;
  disponibleHoy: string | null;
  deudaTarjetas: string | null;
  ahorroTotal: string | null;
  estadoHoy: EstadoDia | null;
  porConfirmar: { cantidad: number; entradas: string; salidas: string; otros: string; sinTasa: number };
}

export function resumir(sim: Simulacion, config: ConfigCaja | null): ResumenCalculado {
  const desde = sim.hoy > sim.inicio ? sim.hoy : sim.inicio;
  const futuros = sim.dias.filter((d) => d.fecha >= desde);
  let puedesGastar: ResumenCalculado["puedesGastar"] = null;
  if (futuros.length && config) {
    const iProximo = futuros.findIndex((d) => d.fecha > sim.hoy && d.tieneIngreso);
    const ventana = iProximo === -1 ? futuros : futuros.slice(0, Math.max(1, iProximo));
    let minimo = ventana[0];
    for (const d of ventana) if (new Big(d.disponible).lt(minimo.disponible)) minimo = d;
    const libre = new Big(minimo.disponible).minus(config.colchon);
    puedesGastar = {
      monto: (libre.gt(0) ? libre : CERO).toString(),
      hasta: iProximo === -1 ? null : futuros[iProximo].fecha,
      diaMinimo: minimo.fecha,
    };
  }
  const hoy = sim.porFecha.get(sim.hoy) ?? null;
  let entradas = CERO;
  let salidas = CERO;
  let otros = CERO;
  let cantidad = 0;
  let sinTasa = 0;
  for (const d of sim.dias) {
    if (d.fecha >= sim.hoy) break;
    for (const o of d.porConfirmar) {
      cantidad++;
      if (o.montoDOP == null) {
        sinTasa++;
        continue;
      }
      if (o.tipo === "ingreso") entradas = entradas.plus(o.montoDOP);
      else if (o.tipo === "gasto") salidas = salidas.plus(o.montoDOP);
      else otros = otros.plus(o.montoDOP);
    }
  }
  return {
    puedesGastar,
    disponibleHoy: hoy?.disponible ?? null,
    deudaTarjetas: hoy?.deuda ?? null,
    ahorroTotal: hoy?.ahorroTotal ?? null,
    estadoHoy: hoy?.estado ?? null,
    porConfirmar: { cantidad, entradas: entradas.toString(), salidas: salidas.toString(), otros: otros.toString(), sinTasa },
  };
}

// ───────────────────────── Movimientos del mes ─────────────────────────

export interface TotalesMes {
  movimientos: MovimientoAplicado[];
  ingresos: string;
  gastos: string;
  /** Transferencias y pagos hacia cuentas de ahorro. */
  ahorro: string;
  pagosTarjeta: string;
  neto: string;
  /** ahorro / ingresos × 100, con 1 decimal. null sin ingresos. */
  tasaAhorro: string | null;
  sinTasa: number;
}

export function movimientosDelMes(datos: DatosCaja, mes: Mes): TotalesMes {
  const cuentas = new Map(datos.cuentas.map((c) => [c.id, c]));
  let ingresos = CERO;
  let gastos = CERO;
  let ahorro = CERO;
  let pagos = CERO;
  let sinTasa = 0;
  const movimientos: MovimientoAplicado[] = [];
  for (const m of datos.movimientos) {
    if (mesDe(m.fecha) !== mes) continue;
    const dop = aDOP(m.monto, m.moneda, m.tasa, datos.config);
    movimientos.push({ ...m, montoDOP: dop ? dop.toString() : null });
    if (!dop) {
      sinTasa++;
      continue;
    }
    if (m.tipo === "ingreso") ingresos = ingresos.plus(dop);
    else if (m.tipo === "gasto") gastos = gastos.plus(dop);
    else {
      if (m.tipo === "pago_tarjeta") pagos = pagos.plus(dop);
      if (m.destino && cuentas.get(m.destino)?.tipo === "ahorro") ahorro = ahorro.plus(dop);
    }
  }
  movimientos.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  return {
    movimientos,
    ingresos: ingresos.toString(),
    gastos: gastos.toString(),
    ahorro: ahorro.toString(),
    pagosTarjeta: pagos.toString(),
    neto: ingresos.minus(gastos).toString(),
    tasaAhorro: ingresos.gt(0) ? ahorro.div(ingresos).times(100).toFixed(1, Big.roundHalfUp) : null,
    sinTasa,
  };
}
