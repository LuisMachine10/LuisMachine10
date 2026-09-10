/**
 * Mena Capital sobre la base de datos.
 *
 * Ninguna pantalla escribe a `db` directamente: todo pasa por aquí, donde se
 * valida antes de guardar. Un asiento roto no llega nunca a un estado.
 */
import { asientoValuacion, validarMovimiento } from '../dominio/capital/cuentas'
import type {
  Cuenta, LineaPresupuesto, MesISO, Movimiento, Tasas,
} from '../dominio/capital/tipos'
import type { CuentaPropuesta } from '../dominio/capital/plan-cuentas'
import { db } from './db'

export const TASAS_POR_DEFECTO: Tasas = { usd: 63 }

export async function tasas(): Promise<Tasas> {
  const guardada = await db.ajustes.get('tasaUSD')
  const usd = Number(guardada?.valor)
  return { usd: Number.isFinite(usd) && usd > 0 ? usd : TASAS_POR_DEFECTO.usd }
}

export async function guardarTasaUSD(usd: number): Promise<void> {
  if (!(usd > 0)) throw new Error('La tasa tiene que ser mayor que cero.')
  await db.ajustes.put({ clave: 'tasaUSD', valor: usd })
}

export async function crearCuenta(
  propuesta: CuentaPropuesta | Omit<Cuenta, 'id'>,
  saldoInicial: number,
  fechaApertura: string,
): Promise<number> {
  const { nombre, clase, grupo, moneda, seValuaAMercado, ticker, activa, nota } = propuesta as Cuenta
  return (await db.cuentas.add({
    nombre, clase, grupo, moneda,
    seValuaAMercado: seValuaAMercado ?? false,
    ticker: ticker ?? '',
    activa: activa ?? true,
    nota: nota ?? '',
    saldoInicial,
    fechaApertura,
  } as Cuenta)) as number
}

export async function actualizarCuenta(id: number, cambios: Partial<Cuenta>): Promise<void> {
  await db.cuentas.update(id, cambios)
}

/**
 * Registra un asiento. Devuelve el mensaje de error si no se puede — la pantalla
 * lo muestra tal cual, en palabras, nunca un código.
 */
export async function registrarMovimiento(mov: Omit<Movimiento, 'id'>): Promise<number> {
  const cuentas = await db.cuentas.toArray()
  const problema = validarMovimiento(mov as Movimiento, cuentas)
  if (problema) throw new Error(problema)
  return (await db.movimientos.add(mov as Movimiento)) as number
}

export async function borrarMovimiento(id: number): Promise<void> {
  await db.movimientos.delete(id)
}

export async function conciliar(id: number, conciliado: boolean): Promise<void> {
  await db.movimientos.update(id, { conciliado })
}

/**
 * Lleva una cuenta a su valor de mercado. La revalorización entra al libro como
 * cualquier otro asiento: si no, el patrimonio crecería sin que nada lo explique.
 */
export async function valuarCuenta(
  cuentaId: number,
  valorMercado: number,
  fecha: string,
  cuentaResultadoId: number,
): Promise<boolean> {
  const [cuenta, movimientos] = await Promise.all([
    db.cuentas.get(cuentaId),
    db.movimientos.toArray(),
  ])
  if (!cuenta) throw new Error('Esa cuenta no existe.')
  const asiento = asientoValuacion(cuenta, valorMercado, fecha, movimientos, cuentaResultadoId)
  if (!asiento) return false
  await db.movimientos.add(asiento as Movimiento)
  return true
}

/** Reemplaza el presupuesto del mes completo: confirmar es una sola operación. */
export async function guardarPresupuesto(mes: MesISO, lineas: LineaPresupuesto[]): Promise<void> {
  await db.transaction('rw', db.presupuesto, async () => {
    await db.presupuesto.where('mes').equals(mes).delete()
    const limpias = lineas
      .filter((l) => l.monto !== 0)
      .map((l) => ({ mes, cuentaId: l.cuentaId, monto: l.monto, nota: l.nota ?? '' }))
    if (limpias.length) await db.presupuesto.bulkAdd(limpias as LineaPresupuesto[])
  })
}
