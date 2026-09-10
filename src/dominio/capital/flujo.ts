/**
 * Flujo de caja: el dinero de verdad, no el resultado.
 *
 * "Sigue el dinero." Si hubo resultado positivo y la caja bajó, los pesos están
 * en algún lado — un certificado, un abono a la tarjeta, una compra. Este módulo
 * los encuentra, clasificados en operación, inversión y financiamiento.
 *
 * Un traspaso entre dos cuentas de efectivo NO es entrada ni salida: mover
 * dinero del Popular al BHD no es ingresar ni gastar, y contarlo infla el flujo.
 */
import { enDOP, saldo } from './cuentas'
import { primerDia, ultimoDia } from './meses'
import type { ComparacionPresupuesto } from './presupuesto'
import { compararPresupuesto } from './presupuesto'
import type { Cuenta, LineaPresupuesto, MesISO, Movimiento, Tasas } from './tipos'
import { centavos, GRUPOS_CAJA } from './tipos'

export type Actividad = 'OPERACION' | 'INVERSION' | 'FINANCIAMIENTO'

export interface FlujoMes {
  mes: MesISO
  saldoInicial: number
  entradas: number
  salidas: number
  flujoNeto: number
  saldoFinal: number
  /** Desglose del neto. Suman exactamente `flujoNeto`. */
  operacion: number
  inversion: number
  financiamiento: number
  /**
   * Saldo con que entraron al sistema las cuentas de efectivo abiertas este mes.
   * No es flujo — no entró de ningún lado, ya estaba ahí — pero sin este renglón
   * la caja del flujo y la del balance no coincidirían el mes de apertura.
   */
  aperturas: number
  /** Cuando es proyección, viene del presupuesto y no del libro. Se rotula distinto. */
  esProyeccion: boolean
}

function esCaja(c: Cuenta | undefined): boolean {
  return !!c && c.clase === 'ACTIVO' && GRUPOS_CAJA.includes(c.grupo)
}

function actividadDe(contraparte: Cuenta): Actividad {
  if (contraparte.clase === 'INGRESO' || contraparte.clase === 'GASTO') return 'OPERACION'
  if (contraparte.clase === 'ACTIVO') return 'INVERSION'
  return 'FINANCIAMIENTO'
}

function cajaAlCierre(cuentas: Cuenta[], movimientos: Movimiento[], fecha: string, tasas: Tasas): number {
  return centavos(
    cuentas
      .filter((c) => esCaja(c) && c.fechaApertura <= fecha)
      .reduce((a, c) => a + enDOP(saldo(c, movimientos, { hasta: fecha }), c.moneda, tasas), 0),
  )
}

export function flujoDelMes(
  cuentas: Cuenta[],
  movimientos: Movimiento[],
  mes: MesISO,
  tasas: Tasas,
): FlujoMes {
  const desde = primerDia(mes)
  const hasta = ultimoDia(mes)
  const porId = new Map(cuentas.map((c) => [c.id, c]))
  const por: Record<Actividad, number> = { OPERACION: 0, INVERSION: 0, FINANCIAMIENTO: 0 }
  let entradas = 0
  let salidas = 0

  for (const mov of movimientos) {
    if (mov.fecha < desde || mov.fecha > hasta) continue
    const cDebe = porId.get(mov.debe)
    const cHaber = porId.get(mov.haber)
    const entra = esCaja(cDebe)
    const sale = esCaja(cHaber)
    if (entra === sale) continue // ni toca caja, o es traspaso entre cuentas de caja

    if (entra && cDebe && cHaber) {
      const monto = enDOP(mov.monto, cDebe.moneda, tasas)
      entradas += monto
      por[actividadDe(cHaber)] += monto
    } else if (sale && cHaber && cDebe) {
      const monto = enDOP(mov.montoHaber ?? mov.monto, cHaber.moneda, tasas)
      salidas += monto
      por[actividadDe(cDebe)] -= monto
    }
  }

  const saldoInicial = cajaAlCierre(cuentas, movimientos, primerDiaAnterior(desde), tasas)
  const aperturas = centavos(
    cuentas
      .filter((c) => esCaja(c) && c.fechaApertura >= desde && c.fechaApertura <= hasta)
      .reduce((a, c) => a + enDOP(c.saldoInicial, c.moneda, tasas), 0),
  )
  const flujoNeto = centavos(entradas - salidas)
  return {
    mes,
    saldoInicial,
    entradas: centavos(entradas),
    salidas: centavos(salidas),
    flujoNeto,
    saldoFinal: centavos(saldoInicial + aperturas + flujoNeto),
    operacion: centavos(por.OPERACION),
    inversion: centavos(por.INVERSION),
    financiamiento: centavos(por.FINANCIAMIENTO),
    aperturas,
    esProyeccion: false,
  }
}

/** El día anterior al primero del mes, sin construir un Date. */
function primerDiaAnterior(primero: string): string {
  const anio = Number(primero.slice(0, 4))
  const mes = Number(primero.slice(5, 7))
  const pa = mes === 1 ? anio - 1 : anio
  const pm = mes === 1 ? 12 : mes - 1
  const dias = [31, (pa % 4 === 0 && pa % 100 !== 0) || pa % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return `${pa}-${String(pm).padStart(2, '0')}-${String(dias[pm - 1]).padStart(2, '0')}`
}

export function flujoCaja(
  cuentas: Cuenta[],
  movimientos: Movimiento[],
  meses: MesISO[],
  tasas: Tasas,
): FlujoMes[] {
  return meses.map((m) => flujoDelMes(cuentas, movimientos, m, tasas))
}

/**
 * Los próximos meses, según el presupuesto.
 *
 * Supuesto explícito, porque un pronóstico con supuestos escondidos no se puede
 * defender: se asume que todo lo presupuestado entra y sale en efectivo dentro
 * del mismo mes. No modela plazos de cobro ni cuotas — cuando haga falta, se
 * modela; mientras tanto se dice.
 */
export function proyectarFlujo(
  cuentas: Cuenta[],
  movimientos: Movimiento[],
  presupuesto: LineaPresupuesto[],
  meses: MesISO[],
  tasas: Tasas,
  cajaDePartida: number,
): FlujoMes[] {
  let saldo = cajaDePartida
  return meses.map((mes) => {
    const c: ComparacionPresupuesto = compararPresupuesto(cuentas, movimientos, presupuesto, mes, tasas)
    const entradas = c.ingresosPpto
    const salidas = c.gastosPpto
    const flujoNeto = centavos(entradas - salidas)
    const saldoInicial = saldo
    saldo = centavos(saldoInicial + flujoNeto)
    return {
      mes,
      saldoInicial,
      entradas,
      salidas,
      flujoNeto,
      saldoFinal: saldo,
      operacion: flujoNeto,
      inversion: 0,
      financiamiento: 0,
      aperturas: 0,
      esProyeccion: true,
    }
  })
}

export interface AvisoFlujo {
  mes: MesISO
  saldoProyectado: number
  mensaje: string
}

/** El mes en que la proyección se queda sin caja. Vacío es buena noticia. */
export function avisosDeFlujo(proyeccion: FlujoMes[], colchonMinimo: number): AvisoFlujo[] {
  return proyeccion
    .filter((f) => f.saldoFinal < colchonMinimo)
    .map((f) => ({
      mes: f.mes,
      saldoProyectado: f.saldoFinal,
      mensaje:
        f.saldoFinal < 0
          ? 'La proyección se queda sin caja este mes.'
          : 'La caja proyectada baja del colchón que definiste.',
    }))
}
