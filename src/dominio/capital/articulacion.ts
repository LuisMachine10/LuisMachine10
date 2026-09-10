/**
 * La prueba de que los tres estados cuentan la misma historia.
 *
 * Este módulo no dibuja nada ni sirve para presumir un ratio. Existe para una
 * sola cosa: demostrar que el estado de situación, el de resultados y el flujo
 * de caja no pueden contradecirse. Si algún día se contradicen, una prueba
 * falla aquí antes de que un número equivocado llegue a una decisión.
 *
 *   Patrimonio final = Patrimonio inicial + Resultado + Aportes − Retiros + Aperturas
 *   Caja final (situación) = Caja inicial + Flujo neto del mes
 */
import { enDOP } from './cuentas'
import { mesAnterior, primerDia, ultimoDia } from './meses'
import { flujoDelMes } from './flujo'
import { estadoResultados } from './resultados'
import { estadoSituacion } from './situacion'
import type { Cuenta, MesISO, Movimiento, Tasas } from './tipos'
import { centavos } from './tipos'

/** Un centavo de tolerancia: por debajo de eso es redondeo, no un error. */
const TOLERANCIA = 0.011

export interface Articulacion {
  mes: MesISO
  patrimonioInicial: number
  resultado: number
  aportes: number
  retiros: number
  /** Cuentas que entraron al sistema este mes trayendo saldo (la libreta aterrizando). */
  aperturas: number
  patrimonioFinal: number
  /** Lo que el patrimonio final tendría que ser si todo cuadra. */
  esperado: number
  /**
   * Lo que no queda explicado. Con un solo tipo de moneda tiene que ser cero
   * exacto. Con cuentas en dólares, es el efecto de convertir a una sola tasa
   * movimientos que ocurrieron a otra: no es un error, pero se muestra.
   */
  diferencia: number
  cuadra: boolean
}

export function articular(
  cuentas: Cuenta[],
  movimientos: Movimiento[],
  mes: MesISO,
  tasas: Tasas,
): Articulacion {
  const cierreAnterior = ultimoDia(mesAnterior(mes))
  const cierre = ultimoDia(mes)
  const inicio = primerDia(mes)

  const antes = estadoSituacion(cuentas, movimientos, cierreAnterior, tasas)
  const ahora = estadoSituacion(cuentas, movimientos, cierre, tasas)
  const resultado = estadoResultados(cuentas, movimientos, mes, tasas).resultado

  const porId = new Map(cuentas.map((c) => [c.id, c]))
  let aportes = 0
  let retiros = 0
  for (const mov of movimientos) {
    if (mov.fecha < inicio || mov.fecha > cierre) continue
    const cDebe = porId.get(mov.debe)
    const cHaber = porId.get(mov.haber)
    if (cHaber?.clase === 'PATRIMONIO') aportes += enDOP(mov.montoHaber ?? mov.monto, cHaber.moneda, tasas)
    if (cDebe?.clase === 'PATRIMONIO') retiros += enDOP(mov.monto, cDebe.moneda, tasas)
  }

  let aperturas = 0
  for (const c of cuentas) {
    if (c.fechaApertura < inicio || c.fechaApertura > cierre) continue
    if (c.clase === 'ACTIVO') aperturas += enDOP(c.saldoInicial, c.moneda, tasas)
    else if (c.clase === 'PASIVO') aperturas -= enDOP(c.saldoInicial, c.moneda, tasas)
  }

  const esperado = centavos(
    antes.patrimonio + resultado + centavos(aportes) - centavos(retiros) + centavos(aperturas),
  )
  const diferencia = centavos(ahora.patrimonio - esperado)

  return {
    mes,
    patrimonioInicial: antes.patrimonio,
    resultado,
    aportes: centavos(aportes),
    retiros: centavos(retiros),
    aperturas: centavos(aperturas),
    patrimonioFinal: ahora.patrimonio,
    esperado,
    diferencia,
    cuadra: Math.abs(diferencia) < TOLERANCIA,
  }
}

export interface CuadreCaja {
  mes: MesISO
  cajaSegunFlujo: number
  cajaSegunSituacion: number
  diferencia: number
  cuadra: boolean
}

/** La caja que dice el flujo tiene que ser la caja que dice el balance. */
export function cuadrarCaja(
  cuentas: Cuenta[],
  movimientos: Movimiento[],
  mes: MesISO,
  tasas: Tasas,
): CuadreCaja {
  const flujo = flujoDelMes(cuentas, movimientos, mes, tasas)
  const situacion = estadoSituacion(cuentas, movimientos, ultimoDia(mes), tasas)
  const diferencia = centavos(flujo.saldoFinal - situacion.caja)
  return {
    mes,
    cajaSegunFlujo: flujo.saldoFinal,
    cajaSegunSituacion: situacion.caja,
    diferencia,
    cuadra: Math.abs(diferencia) < TOLERANCIA,
  }
}

export interface ProblemaLibro {
  movimientoId: number | undefined
  fecha: string
  descripcion: string
  problema: string
}

/**
 * Asientos que apuntan a cuentas que no existen o que no tienen sentido. Es la
 * revisión que corre antes de creerle a cualquier estado.
 */
export function revisarLibro(movimientos: Movimiento[], cuentas: Cuenta[]): ProblemaLibro[] {
  const ids = new Set(cuentas.map((c) => c.id))
  const problemas: ProblemaLibro[] = []
  for (const mov of movimientos) {
    const falla =
      !ids.has(mov.debe) ? 'La cuenta que recibe no existe.'
      : !ids.has(mov.haber) ? 'La cuenta que entrega no existe.'
      : mov.debe === mov.haber ? 'El asiento se debe a sí mismo.'
      : !(mov.monto > 0) ? 'El monto no es mayor que cero.'
      : null
    if (falla) {
      problemas.push({
        movimientoId: mov.id,
        fecha: mov.fecha,
        descripcion: mov.descripcion,
        problema: falla,
      })
    }
  }
  return problemas
}
