// Filas de Postgres (montos como texto: col::text) → modelo del motor. Puro, sin red: lo usan
// lib/caja/datos.ts (PostgREST) y las pruebas de base (SQL directo).

import Big from "big.js";
import { cicloDe } from "./ciclo";
import { sumarDias } from "./fechas";
import { type Categoria, claveUSD, type ConfigCaja, type Cuenta, type DatosCaja, type Movimiento, type NotaDia, type Omitido, type Recurrente, type SaldoReal } from "./tipos";

/** Columnas que se piden a cada tabla. Los numeric siempre como ::text. */
export const COLUMNAS = {
  caja_config: "inicio, colchon::text, margen::text, tasa_usd::text, actualizado_en",
  caja_cuentas: "id, nombre, tipo, saldo_inicial::text, limite::text, orden",
  caja_categorias: "id, nombre, tipo, adicional::text",
  caja_recurrentes:
    "id, nombre, tipo, monto::text, moneda, pago_total, cuenta, destino, categoria, frecuencia, dias, cada_n, fecha, desde, hasta, activo",
  caja_movimientos: "id, fecha, tipo, monto::text, moneda, tasa::text, cuenta, destino, categoria, nota, recurrente_id, actualizado_en",
  caja_omitidos: "fecha, recurrente_id",
  caja_saldos_reales: "fecha, cuenta_id, saldo::text, actualizado_en",
  caja_notas: "fecha, nota",
} as const;

/**
 * Columnas de la Fase F (migración 20261027000100_deudas_y_dolares.sql): moneda de la cuenta e interés de un
 * pago de tarjeta o préstamo. Aparte de COLUMNAS para que las pruebas que leen una base anterior a esa
 * migración sigan leyendo igual. La app lee siempre COLUMNAS_COMPLETAS.
 */
export const COLUMNAS_COMPLETAS = {
  ...COLUMNAS,
  caja_cuentas: `${COLUMNAS.caja_cuentas}, moneda`,
  // parte: tarjetas en dos monedas (migración 20261028000100_tarjetas_ciclo.sql).
  caja_recurrentes: `${COLUMNAS.caja_recurrentes}, parte`,
  caja_movimientos: `${COLUMNAS.caja_movimientos}, interes::text, parte`,
} as const;

/** Orden en que se leen (la simulación depende del orden de recurrentes y movimientos). */
export const ORDEN = {
  caja_cuentas: ["orden", "n"],
  caja_categorias: ["n"],
  caja_recurrentes: ["n"],
  caja_movimientos: ["fecha", "n"],
} as const;

type F = Record<string, unknown>;
const s = (v: unknown) => (v == null ? null : String(v));
// node-postgres convierte date en un Date a medianoche local; PostgREST lo manda como texto.
const fecha = (v: unknown) =>
  v instanceof Date
    ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`
    : String(v).slice(0, 10);

export interface FilasCaja {
  config: F | null;
  cuentas: F[];
  categorias: F[];
  recurrentes: F[];
  movimientos: F[];
  omitidos: F[];
  saldos: F[];
  notas: F[];
}

export function filasADatos(f: FilasCaja): DatosCaja {
  const config: ConfigCaja | null = f.config
    ? { inicio: fecha(f.config.inicio), colchon: String(f.config.colchon), margen: String(f.config.margen), tasaUSD: s(f.config.tasa_usd) }
    : null;
  return {
    config,
    cuentas: f.cuentas.map(
      (c): Cuenta => ({
        id: String(c.id),
        nombre: String(c.nombre),
        tipo: c.tipo as Cuenta["tipo"],
        saldoInicial: String(c.saldo_inicial),
        limite: s(c.limite),
        orden: Number(c.orden ?? 0),
        ...(c.moneda && c.moneda !== "DOP" ? { moneda: c.moneda as Cuenta["moneda"] } : {}),
      }),
    ),
    categorias: f.categorias.map(
      (c): Categoria => ({ id: String(c.id), nombre: String(c.nombre), tipo: c.tipo as Categoria["tipo"], adicional: s(c.adicional) }),
    ),
    recurrentes: f.recurrentes.map(
      (r): Recurrente => ({
        id: String(r.id),
        nombre: String(r.nombre),
        tipo: r.tipo as Recurrente["tipo"],
        monto: String(r.monto),
        moneda: r.moneda as Recurrente["moneda"],
        pagoTotal: r.pago_total === true,
        cuenta: s(r.cuenta),
        destino: s(r.destino),
        categoria: s(r.categoria),
        frecuencia: r.frecuencia as Recurrente["frecuencia"],
        dias: String(r.dias ?? ""),
        cadaN: r.cada_n == null ? null : Number(r.cada_n),
        fecha: r.fecha == null ? null : fecha(r.fecha),
        desde: r.desde == null ? null : fecha(r.desde),
        hasta: r.hasta == null ? null : fecha(r.hasta),
        activo: r.activo !== false,
        ...(r.parte === "DOP" || r.parte === "USD" ? { parte: r.parte } : {}),
      }),
    ),
    movimientos: f.movimientos.map(
      (m): Movimiento => ({
        id: String(m.id),
        fecha: fecha(m.fecha),
        tipo: m.tipo as Movimiento["tipo"],
        monto: String(m.monto),
        moneda: m.moneda as Movimiento["moneda"],
        tasa: s(m.tasa),
        cuenta: s(m.cuenta),
        destino: s(m.destino),
        categoria: s(m.categoria),
        nota: s(m.nota),
        recurrenteId: s(m.recurrente_id),
        ...(m.interes != null ? { interes: String(m.interes) } : {}),
        ...(m.parte === "DOP" || m.parte === "USD" ? { parte: m.parte } : {}),
      }),
    ),
    omitidos: f.omitidos.map((o): Omitido => ({ fecha: fecha(o.fecha), recurrenteId: String(o.recurrente_id) })),
    saldos: f.saldos.map((x): SaldoReal => ({ fecha: fecha(x.fecha), cuentaId: String(x.cuenta_id), saldo: String(x.saldo) })),
    notas: f.notas.map((n): NotaDia => ({ fecha: fecha(n.fecha), nota: String(n.nota) })),
  };
}

/** Última vez que Mena tocó algo (para el sello «verificado hace…»). */
export function ultimaEdicion(f: FilasCaja): string | null {
  const todas = [f.config?.actualizado_en, ...f.movimientos.map((m) => m.actualizado_en), ...f.saldos.map((x) => x.actualizado_en)]
    .filter((x) => x != null)
    .map((x) => (x instanceof Date ? x.toISOString() : String(x)));
  return todas.sort().at(-1) ?? null;
}

/** Lo que el Presupuesto lee del registro único por cada cuenta enlazada (caja_cuentas → activos). */
export const COLUMNAS_ENLACE =
  "id, registro_id, activos(clase, moneda, tasa::text, dia_corte, dias_para_pagar, dia_pago, limite_usd::text, saldo_usd::text, saldo_usd_fecha)";

export interface FilaEnlace {
  id: string;
  registro_id: string | null;
  activos: Record<string, unknown> | null;
}

/**
 * Completa las cuentas del Presupuesto con lo que vive en el registro único (Portafolio → Mis cuentas): la tasa
 * de préstamos y deudas (para separar interés y capital), el ciclo de cada tarjeta y su parte en US$. Devuelve el
 * enlace cuenta → fila del registro.
 *
 * Parte en US$ de una tarjeta: lo que se debía en US$ al empezar el Presupuesto es el saldo escrito si es de esa
 * fecha o antes; si se escribió después, entra como cuadre de ese día («<id>#usd», sintético: no se guarda), igual
 * que el saldo en RD$ de una cuenta enlazada. Desde ahí lo mueven los pagos y cargos a esa parte.
 */
export function conRegistro(datos: DatosCaja, filas: FilaEnlace[]): Record<string, string> {
  const enlaces: Record<string, string> = {};
  const inicio = datos.config?.inicio ?? null;
  for (const e of filas) {
    if (e.registro_id) enlaces[e.id] = e.registro_id;
    const a = e.activos;
    const c = datos.cuentas.find((x) => x.id === e.id);
    if (!a || !c) continue;
    const clase = String(a.clase);
    if ((clase === "prestamo" || clase === "deuda") && a.tasa && new Big(String(a.tasa)).gt(0)) c.tasaAnual = String(a.tasa);
    if (clase !== "tarjeta") continue;
    const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    const ciclo = cicloDe({ diaCorte: num(a.dia_corte), diasParaPagar: num(a.dias_para_pagar), diaPago: num(a.dia_pago) });
    if (ciclo) c.ciclo = ciclo;
    if (a.dia_pago != null) c.diaPago = Number(a.dia_pago);
    const limiteUsd = s(a.limite_usd);
    const saldoUsd = s(a.saldo_usd);
    if (a.moneda !== "DOP" || (limiteUsd === null && saldoUsd === null)) continue;
    const fechaUsd = a.saldo_usd_fecha == null ? null : fecha(a.saldo_usd_fecha);
    if (saldoUsd !== null && fechaUsd && inicio && fechaUsd > inicio) {
      c.usd = { saldoInicial: "0", limite: limiteUsd };
      const k = claveUSD(c.id);
      const dia = sumarDias(fechaUsd, -1);
      if (!datos.saldos.some((x) => x.cuentaId === k && x.fecha === dia)) datos.saldos.push({ fecha: dia, cuentaId: k, saldo: saldoUsd, sintetico: true });
    } else {
      c.usd = { saldoInicial: saldoUsd ?? "0", limite: limiteUsd };
    }
  }
  return enlaces;
}
