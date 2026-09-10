/**
 * Mena Capital — el vocabulario.
 *
 * Un solo libro de movimientos por partida doble. El estado de situación, el
 * estado de resultados y el flujo de caja NO son tres registros: son tres
 * lecturas del mismo libro. Por eso no pueden contradecirse.
 */
import type { FechaISO } from '../tipos'

/** Mes calendario: "2026-09". Nunca un Date, por lo mismo que FechaISO. */
export type MesISO = string

export type Moneda = 'DOP' | 'USD'

export type ClaseCuenta = 'ACTIVO' | 'PASIVO' | 'PATRIMONIO' | 'INGRESO' | 'GASTO'

/**
 * El grupo define dos cosas: dónde se presenta el renglón y en qué orden.
 * Los activos van en orden de liquidez, como en un balance de verdad.
 */
export type Grupo =
  // Activos, de más líquido a menos
  | 'EFECTIVO' | 'CERTIFICADO' | 'INVERSION' | 'POR COBRAR' | 'PROPIEDAD' | 'OTRO ACTIVO'
  // Pasivos, de más exigible a menos
  | 'TARJETA' | 'POR PAGAR' | 'PRESTAMO' | 'OTRO PASIVO'
  // Patrimonio
  | 'CAPITAL'
  // Resultados — la separación fijo/variable es la que permite presupuestar
  | 'INGRESO FIJO' | 'INGRESO VARIABLE'
  | 'GASTO FIJO' | 'GASTO VARIABLE'

export const GRUPOS_ACTIVO: Grupo[] = [
  'EFECTIVO', 'CERTIFICADO', 'INVERSION', 'POR COBRAR', 'PROPIEDAD', 'OTRO ACTIVO',
]
export const GRUPOS_PASIVO: Grupo[] = ['TARJETA', 'POR PAGAR', 'PRESTAMO', 'OTRO PASIVO']

/** El efectivo verdadero: lo único que cuenta como caja en el flujo. */
export const GRUPOS_CAJA: Grupo[] = ['EFECTIVO']

export const NOMBRE_GRUPO: Record<Grupo, string> = {
  EFECTIVO: 'Efectivo y bancos',
  CERTIFICADO: 'Certificados',
  INVERSION: 'Inversiones',
  'POR COBRAR': 'Cuentas por cobrar',
  PROPIEDAD: 'Propiedades y equipos',
  'OTRO ACTIVO': 'Otros activos',
  TARJETA: 'Tarjetas de crédito',
  'POR PAGAR': 'Cuentas por pagar',
  PRESTAMO: 'Préstamos',
  'OTRO PASIVO': 'Otros pasivos',
  CAPITAL: 'Capital',
  'INGRESO FIJO': 'Ingresos fijos',
  'INGRESO VARIABLE': 'Ingresos variables',
  'GASTO FIJO': 'Gastos fijos',
  'GASTO VARIABLE': 'Gastos variables',
}

export interface Cuenta {
  id: number
  nombre: string
  clase: ClaseCuenta
  grupo: Grupo
  moneda: Moneda
  /**
   * El saldo con el que la cuenta entra al sistema. Aquí es donde aterriza la
   * libreta: lo que ya tenías el día que empezaste a medir.
   */
  saldoInicial: number
  fechaApertura: FechaISO
  /** Un certificado o una acción no valen lo que costaron: valen lo que valen hoy. */
  seValuaAMercado: boolean
  /** Para lo que cotiza. Vacío en lo demás. */
  ticker: string
  activa: boolean
  nota: string
}

export type OrigenMovimiento =
  | 'manual'      // lo escribiste tú
  | 'apertura'    // el saldo con que entró la cuenta
  | 'valuacion'   // ajuste a valor de mercado
  | 'libreta'     // importado de la libreta o del Excel

/**
 * Un asiento. `monto` SIEMPRE es positivo: un monto negativo es un asiento al
 * revés, no un monto. `montoHaber` solo se usa cuando las dos cuentas están en
 * monedas distintas (comprar dólares, por ejemplo); la diferencia entre los dos
 * montos es la tasa a la que ocurrió de verdad.
 */
export interface Movimiento {
  id?: number
  fecha: FechaISO
  descripcion: string
  monto: number
  debe: number
  haber: number
  montoHaber?: number
  origen: OrigenMovimiento
  /** Confirmado contra el estado de cuenta del banco. */
  conciliado: boolean
}

/** Una línea del presupuesto: cuánto esperas de esta cuenta en este mes. */
export interface LineaPresupuesto {
  id?: number
  mes: MesISO
  cuentaId: number
  monto: number
  nota: string
}

/** RD$ por US$1. Se guarda con el estado, porque un total convertido sin su tasa es un rumor. */
export interface Tasas {
  usd: number
}

/** Redondeo a centavos. Se aplica en cada total, no en cada suma intermedia. */
export function centavos(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
