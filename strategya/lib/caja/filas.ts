// Filas de Postgres (montos como texto: col::text) → modelo del motor. Puro, sin red: lo usan
// lib/caja/datos.ts (PostgREST) y las pruebas de base (SQL directo).

import type { Categoria, ConfigCaja, Cuenta, DatosCaja, Movimiento, NotaDia, Omitido, Recurrente, SaldoReal } from "./tipos";

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
  caja_movimientos: `${COLUMNAS.caja_movimientos}, interes::text`,
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
