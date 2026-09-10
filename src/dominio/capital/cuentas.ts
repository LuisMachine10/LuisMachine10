/**
 * Saldos. Todo lo demás en Mena Capital se construye sobre estas funciones.
 *
 * Hay dos naturalezas de cuenta y confundirlas es el error clásico:
 * los activos y los gastos aumentan al DEBE; los pasivos, el patrimonio y los
 * ingresos aumentan al HABER. Un préstamo con saldo 50,000 tiene 50,000 al
 * haber, y se muestra positivo — no negativo — porque es lo que debes.
 */
import type { FechaISO } from '../tipos'
import type { ClaseCuenta, Cuenta, Moneda, Movimiento, Tasas } from './tipos'
import { centavos } from './tipos'

export type Naturaleza = 'DEUDORA' | 'ACREEDORA'

export function naturaleza(clase: ClaseCuenta): Naturaleza {
  return clase === 'ACTIVO' || clase === 'GASTO' ? 'DEUDORA' : 'ACREEDORA'
}

/** Cuentas de saldo acumulado (balance) vs. cuentas de período (resultados). */
export function esDeBalance(clase: ClaseCuenta): boolean {
  return clase === 'ACTIVO' || clase === 'PASIVO' || clase === 'PATRIMONIO'
}

export interface Ventana {
  /** Solo para cuentas de resultados. Las de balance siempre acumulan desde el origen. */
  desde?: FechaISO
  hasta: FechaISO
}

/** El monto que este asiento le carga a la cuenta indicada, en la moneda de ella. */
function montoEn(mov: Movimiento, cuentaId: number): { debe: number; haber: number } {
  return {
    debe: mov.debe === cuentaId ? mov.monto : 0,
    haber: mov.haber === cuentaId ? (mov.montoHaber ?? mov.monto) : 0,
  }
}

export function saldo(cuenta: Cuenta, movimientos: Movimiento[], v: Ventana): number {
  const deBalance = esDeBalance(cuenta.clase)
  let debe = 0
  let haber = 0
  for (const mov of movimientos) {
    if (mov.fecha > v.hasta) continue
    if (!deBalance && v.desde && mov.fecha < v.desde) continue
    const m = montoEn(mov, cuenta.id)
    debe += m.debe
    haber += m.haber
  }
  // El saldo inicial solo aplica a cuentas de balance, y solo si ya abrió.
  const inicial = deBalance && cuenta.fechaApertura <= v.hasta ? cuenta.saldoInicial : 0
  const neto = naturaleza(cuenta.clase) === 'DEUDORA' ? debe - haber : haber - debe
  return centavos(inicial + neto)
}

export function saldos(cuentas: Cuenta[], movimientos: Movimiento[], v: Ventana): Map<number, number> {
  return new Map(cuentas.map((c) => [c.id, saldo(c, movimientos, v)]))
}

/**
 * Convierte a pesos. Nunca en silencio: quien llama guarda la tasa junto al
 * total, porque un monto convertido sin su tasa no se puede defender.
 */
export function enDOP(monto: number, moneda: Moneda, tasas: Tasas): number {
  return centavos(moneda === 'USD' ? monto * tasas.usd : monto)
}

/**
 * Qué está mal con este asiento. `null` si está bien.
 * Se valida aquí, en el dominio, para que ninguna pantalla pueda meter basura.
 */
export function validarMovimiento(mov: Movimiento, cuentas: Cuenta[]): string | null {
  if (!mov.fecha || mov.fecha.length !== 10) return 'El asiento necesita una fecha.'
  if (!(mov.monto > 0)) return 'El monto tiene que ser mayor que cero. Para invertir el sentido, cambia las cuentas.'
  if (mov.debe === mov.haber) return 'Una cuenta no puede deberse a sí misma.'
  const debe = cuentas.find((c) => c.id === mov.debe)
  const haber = cuentas.find((c) => c.id === mov.haber)
  if (!debe) return 'La cuenta que recibe no existe.'
  if (!haber) return 'La cuenta que entrega no existe.'
  if (debe.moneda !== haber.moneda && !(mov.montoHaber && mov.montoHaber > 0)) {
    return `${debe.nombre} está en ${debe.moneda} y ${haber.nombre} en ${haber.moneda}: hace falta el monto de los dos lados.`
  }
  return null
}

/**
 * El asiento que lleva una cuenta a su valor de mercado, contra ganancia o
 * pérdida no realizada. La revalorización pasa por el libro como cualquier otra
 * cosa — si no, el patrimonio crecería sin que ningún estado lo explique.
 *
 * Devuelve `null` si ya está en ese valor: no se ensucia el libro con ceros.
 */
export function asientoValuacion(
  cuenta: Cuenta,
  valorMercado: number,
  fecha: FechaISO,
  movimientos: Movimiento[],
  cuentaResultado: number,
): Movimiento | null {
  const actual = saldo(cuenta, movimientos, { hasta: fecha })
  const diferencia = centavos(valorMercado - actual)
  if (diferencia === 0) return null
  const sube = diferencia > 0
  return {
    fecha,
    descripcion: `Valuación de ${cuenta.nombre} a mercado`,
    monto: Math.abs(diferencia),
    debe: sube ? cuenta.id : cuentaResultado,
    haber: sube ? cuentaResultado : cuenta.id,
    origen: 'valuacion',
    conciliado: true,
  }
}
