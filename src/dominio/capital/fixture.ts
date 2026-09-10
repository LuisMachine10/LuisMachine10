/**
 * Un juego de datos realista para las pruebas: cuentas en pesos y en dólares,
 * un certificado, una tarjeta, un préstamo y un mes de movimientos.
 * No es seed de la app — vive solo en las pruebas.
 */
import type { Cuenta, LineaPresupuesto, Movimiento, Tasas } from './tipos'

export const TASAS: Tasas = { usd: 63 }

export const CUENTAS: Cuenta[] = [
  c(1, 'Banco Popular', 'ACTIVO', 'EFECTIVO', 'DOP', 180_000),
  c(2, 'Efectivo', 'ACTIVO', 'EFECTIVO', 'DOP', 12_000),
  c(3, 'Certificado BHD', 'ACTIVO', 'CERTIFICADO', 'DOP', 500_000),
  c(4, 'Cuenta de corretaje', 'ACTIVO', 'INVERSION', 'USD', 4_000, true),
  c(10, 'Tarjeta Visa', 'PASIVO', 'TARJETA', 'DOP', 45_000),
  c(11, 'Préstamo de vehículo', 'PASIVO', 'PRESTAMO', 'DOP', 620_000),
  c(20, 'Salario', 'INGRESO', 'INGRESO FIJO', 'DOP', 0),
  c(21, 'Intereses de certificado', 'INGRESO', 'INGRESO VARIABLE', 'DOP', 0),
  c(22, 'Ganancia no realizada', 'INGRESO', 'INGRESO VARIABLE', 'DOP', 0),
  c(30, 'Vivienda', 'GASTO', 'GASTO FIJO', 'DOP', 0),
  c(31, 'Cuota del préstamo', 'GASTO', 'GASTO FIJO', 'DOP', 0),
  c(32, 'Alimentación', 'GASTO', 'GASTO VARIABLE', 'DOP', 0),
  c(33, 'Transporte', 'GASTO', 'GASTO VARIABLE', 'DOP', 0),
]

function c(
  id: number, nombre: string, clase: Cuenta['clase'], grupo: Cuenta['grupo'],
  moneda: Cuenta['moneda'], saldoInicial: number, seValuaAMercado = false,
): Cuenta {
  return {
    id, nombre, clase, grupo, moneda, saldoInicial,
    fechaApertura: '2026-08-31', seValuaAMercado, ticker: '', activa: true, nota: '',
  }
}

let n = 0
const m = (
  fecha: string, descripcion: string, monto: number, debe: number, haber: number,
  extra: Partial<Movimiento> = {},
): Movimiento => ({
  id: ++n, fecha, descripcion, monto, debe, haber,
  origen: 'manual', conciliado: false, ...extra,
})

/** Septiembre 2026, un mes con todo lo que puede pasar. */
export const MOVIMIENTOS: Movimiento[] = [
  m('2026-09-01', 'Alquiler', 35_000, 30, 1),
  m('2026-09-05', 'Salario primera quincena', 95_000, 1, 20),
  m('2026-09-07', 'Supermercado', 8_400, 32, 10),   // gasto a crédito: no toca caja
  m('2026-09-10', 'Gasolina', 4_200, 33, 1),
  m('2026-09-12', 'Abono a la tarjeta', 20_000, 10, 1), // financiamiento
  m('2026-09-15', 'Traspaso a efectivo', 6_000, 2, 1),  // NO es entrada ni salida
  m('2026-09-18', 'Intereses del certificado', 3_750, 3, 21), // se capitaliza, no entra a caja
  m('2026-09-20', 'Salario segunda quincena', 95_000, 1, 20),
  m('2026-09-22', 'Cuota del vehículo', 18_500, 31, 1),
  m('2026-09-22', 'Amortización de capital', 11_000, 11, 1),  // financiamiento
  m('2026-09-25', 'Aporte al corretaje', 500, 4, 1, { montoHaber: 31_500 }), // USD contra DOP
  m('2026-09-28', 'Supermercado', 9_100, 32, 1),
  m('2026-09-30', 'Valuación del corretaje', 120, 4, 22, { origen: 'valuacion', montoHaber: 7_560 }),
]

export const PRESUPUESTO: LineaPresupuesto[] = [
  p(20, 190_000), p(21, 3_500),
  p(30, 35_000), p(31, 18_500), p(32, 20_000), p(33, 5_000),
]

function p(cuentaId: number, monto: number): LineaPresupuesto {
  return { mes: '2026-09', cuentaId, monto, nota: '' }
}
