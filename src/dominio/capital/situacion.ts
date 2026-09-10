/**
 * Estado de situación: qué tienes, qué debes y qué queda tuyo, a una fecha.
 *
 * El patrimonio NO se guarda en ningún lado: se calcula como activos menos
 * pasivos. Un patrimonio que se teclea aparte es un patrimonio que miente el
 * día que alguien se equivoca.
 */
import type { FechaISO } from '../tipos'
import { enDOP, saldo } from './cuentas'
import type { Cuenta, Grupo, Moneda, Movimiento, Tasas } from './tipos'
import { centavos, GRUPOS_ACTIVO, GRUPOS_CAJA, GRUPOS_PASIVO, NOMBRE_GRUPO } from './tipos'

export interface RenglonSituacion {
  cuentaId: number
  nombre: string
  grupo: Grupo
  moneda: Moneda
  /** En la moneda de la cuenta: lo que dice el estado de cuenta del banco. */
  saldo: number
  /** El mismo saldo en pesos, a la tasa que va guardada en el estado. */
  saldoDOP: number
}

export interface BloqueSituacion {
  grupo: Grupo
  nombre: string
  renglones: RenglonSituacion[]
  totalDOP: number
}

export interface EstadoSituacion {
  fecha: FechaISO
  tasas: Tasas
  activos: BloqueSituacion[]
  pasivos: BloqueSituacion[]
  totalActivos: number
  totalPasivos: number
  patrimonio: number
  /** Efectivo y bancos. El número que decide si duermes tranquilo. */
  caja: number
  /** Lo exigible ya: tarjetas y cuentas por pagar. */
  deudaCorto: number
}

function armarBloques(
  grupos: Grupo[],
  cuentas: Cuenta[],
  movimientos: Movimiento[],
  fecha: FechaISO,
  tasas: Tasas,
): BloqueSituacion[] {
  const bloques: BloqueSituacion[] = []
  for (const grupo of grupos) {
    const renglones = cuentas
      .filter((c) => c.grupo === grupo && c.fechaApertura <= fecha)
      .map((c) => {
        const s = saldo(c, movimientos, { hasta: fecha })
        return {
          cuentaId: c.id,
          nombre: c.nombre,
          grupo,
          moneda: c.moneda,
          saldo: s,
          saldoDOP: enDOP(s, c.moneda, tasas),
        }
      })
      // Una cuenta cerrada en cero no ensucia el balance; una cuenta inactiva con
      // saldo sí se muestra, porque el saldo existe aunque no la uses.
      .filter((r) => r.saldo !== 0)
    if (renglones.length === 0) continue
    bloques.push({
      grupo,
      nombre: NOMBRE_GRUPO[grupo],
      renglones,
      totalDOP: centavos(renglones.reduce((a, r) => a + r.saldoDOP, 0)),
    })
  }
  return bloques
}

export function estadoSituacion(
  cuentas: Cuenta[],
  movimientos: Movimiento[],
  fecha: FechaISO,
  tasas: Tasas,
): EstadoSituacion {
  const activos = armarBloques(GRUPOS_ACTIVO, cuentas, movimientos, fecha, tasas)
  const pasivos = armarBloques(GRUPOS_PASIVO, cuentas, movimientos, fecha, tasas)
  const totalActivos = centavos(activos.reduce((a, b) => a + b.totalDOP, 0))
  const totalPasivos = centavos(pasivos.reduce((a, b) => a + b.totalDOP, 0))
  const caja = centavos(
    activos.filter((b) => GRUPOS_CAJA.includes(b.grupo)).reduce((a, b) => a + b.totalDOP, 0),
  )
  const deudaCorto = centavos(
    pasivos.filter((b) => b.grupo === 'TARJETA' || b.grupo === 'POR PAGAR')
      .reduce((a, b) => a + b.totalDOP, 0),
  )
  return {
    fecha,
    tasas,
    activos,
    pasivos,
    totalActivos,
    totalPasivos,
    patrimonio: centavos(totalActivos - totalPasivos),
    caja,
    deudaCorto,
  }
}

export interface Indicadores {
  /** Pasivos / activos. Cuánto de lo que tienes no es tuyo. */
  endeudamiento: number | null
  /** Caja / deuda exigible ya. Menos de 1 significa que dependes de lo que entre. */
  liquidez: number | null
  /**
   * Meses que aguantas sin que entre un peso. El número más honesto de las
   * finanzas personales, y el que ninguna app enseña.
   */
  mesesDeColchon: number | null
}

export function indicadores(e: EstadoSituacion, gastoMensualPromedio: number): Indicadores {
  return {
    endeudamiento: e.totalActivos > 0 ? centavos(e.totalPasivos / e.totalActivos) : null,
    liquidez: e.deudaCorto > 0 ? centavos(e.caja / e.deudaCorto) : null,
    mesesDeColchon: gastoMensualPromedio > 0 ? centavos(e.caja / gastoMensualPromedio) : null,
  }
}

export interface Variacion {
  nombre: string
  antes: number
  ahora: number
  cambio: number
  cambioPct: number | null
}

/**
 * Ninguna cifra viaja sola. Esto es lo que convierte el balance en algo que se
 * puede interrogar: qué cambió, cuánto, y contra qué se compara.
 */
export function compararSituacion(antes: EstadoSituacion, ahora: EstadoSituacion): Variacion[] {
  const par = (nombre: string, a: number, b: number): Variacion => ({
    nombre,
    antes: a,
    ahora: b,
    cambio: centavos(b - a),
    cambioPct: a !== 0 ? centavos(((b - a) / Math.abs(a)) * 100) : null,
  })
  return [
    par('Activos', antes.totalActivos, ahora.totalActivos),
    par('Pasivos', antes.totalPasivos, ahora.totalPasivos),
    par('Patrimonio', antes.patrimonio, ahora.patrimonio),
    par('Efectivo', antes.caja, ahora.caja),
  ]
}
