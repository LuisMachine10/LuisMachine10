/**
 * Presupuesto contra realidad.
 *
 * La regla que casi todo dashboard se come: una varianza no es favorable por ser
 * positiva. Gastar menos de lo presupuestado es bueno; ingresar menos es malo.
 * El signo depende de la clase de cuenta, no del signo del número.
 */
import { enDOP, saldo } from './cuentas'
import { primerDia, ultimoDia } from './meses'
import type { ClaseCuenta, Cuenta, Grupo, LineaPresupuesto, MesISO, Movimiento, Tasas } from './tipos'
import { centavos } from './tipos'

export interface Varianza {
  cuentaId: number
  nombre: string
  clase: ClaseCuenta
  grupo: Grupo
  presupuestado: number
  real: number
  /** real − presupuestado, tal cual. El juicio va aparte, en `favorable`. */
  varianza: number
  varianzaPct: number | null
  favorable: boolean
  /** No estaba en el presupuesto y aun así ocurrió. Es lo primero que hay que mirar. */
  noPresupuestado: boolean
}

export interface ComparacionPresupuesto {
  mes: MesISO
  ingresos: Varianza[]
  gastos: Varianza[]
  ingresosPpto: number
  ingresosReal: number
  gastosPpto: number
  gastosReal: number
  resultadoPpto: number
  resultadoReal: number
  /** Cuánto mejor o peor te fue que lo planificado. */
  varianzaResultado: number
  /** Las tres desviaciones más grandes en pesos, sin importar el signo. */
  mayoresDesviaciones: Varianza[]
}

function esFavorable(clase: ClaseCuenta, varianza: number): boolean {
  return clase === 'INGRESO' ? varianza >= 0 : varianza <= 0
}

export function compararPresupuesto(
  cuentas: Cuenta[],
  movimientos: Movimiento[],
  presupuesto: LineaPresupuesto[],
  mes: MesISO,
  tasas: Tasas,
): ComparacionPresupuesto {
  const ventana = { desde: primerDia(mes), hasta: ultimoDia(mes) }
  const delMes = presupuesto.filter((l) => l.mes === mes)
  const pptoPorCuenta = new Map(delMes.map((l) => [l.cuentaId, l.monto]))

  const armar = (clase: 'INGRESO' | 'GASTO'): Varianza[] =>
    cuentas
      .filter((c) => c.clase === clase)
      .map((c) => {
        const presupuestado = centavos(pptoPorCuenta.get(c.id) ?? 0)
        const real = enDOP(saldo(c, movimientos, ventana), c.moneda, tasas)
        const varianza = centavos(real - presupuestado)
        return {
          cuentaId: c.id,
          nombre: c.nombre,
          clase: c.clase,
          grupo: c.grupo,
          presupuestado,
          real,
          varianza,
          varianzaPct: presupuestado !== 0 ? centavos((varianza / presupuestado) * 100) : null,
          favorable: esFavorable(c.clase, varianza),
          noPresupuestado: presupuestado === 0 && real !== 0,
        }
      })
      // Una cuenta sin presupuesto y sin movimiento no es un renglón: es ruido.
      .filter((v) => v.presupuestado !== 0 || v.real !== 0)
      .sort((a, b) => Math.abs(b.varianza) - Math.abs(a.varianza))

  const ingresos = armar('INGRESO')
  const gastos = armar('GASTO')
  const total = (vs: Varianza[], campo: 'presupuestado' | 'real') =>
    centavos(vs.reduce((a, v) => a + v[campo], 0))

  const ingresosPpto = total(ingresos, 'presupuestado')
  const ingresosReal = total(ingresos, 'real')
  const gastosPpto = total(gastos, 'presupuestado')
  const gastosReal = total(gastos, 'real')
  const resultadoPpto = centavos(ingresosPpto - gastosPpto)
  const resultadoReal = centavos(ingresosReal - gastosReal)

  return {
    mes,
    ingresos,
    gastos,
    ingresosPpto,
    ingresosReal,
    gastosPpto,
    gastosReal,
    resultadoPpto,
    resultadoReal,
    varianzaResultado: centavos(resultadoReal - resultadoPpto),
    mayoresDesviaciones: [...ingresos, ...gastos]
      .sort((a, b) => Math.abs(b.varianza) - Math.abs(a.varianza))
      .slice(0, 3),
  }
}

/**
 * Copia el presupuesto de un mes al siguiente. Es como se arma un año sin
 * teclear doce veces lo mismo — y como se proyecta el flujo hacia adelante.
 */
export function copiarPresupuesto(
  presupuesto: LineaPresupuesto[],
  desde: MesISO,
  hacia: MesISO[],
): LineaPresupuesto[] {
  const base = presupuesto.filter((l) => l.mes === desde)
  return hacia.flatMap((mes) =>
    base.map((l) => ({ mes, cuentaId: l.cuentaId, monto: l.monto, nota: l.nota })),
  )
}

/**
 * Presupuesto sugerido a partir de lo que de verdad gastas: el promedio de los
 * meses con datos, cuenta por cuenta. Es una sugerencia con procedencia, no un
 * dato guardado — la app propone, tú confirmas.
 */
export function sugerirPresupuesto(
  cuentas: Cuenta[],
  movimientos: Movimiento[],
  meses: MesISO[],
  mesDestino: MesISO,
  tasas: Tasas,
): LineaPresupuesto[] {
  const salida: LineaPresupuesto[] = []
  for (const c of cuentas) {
    if (c.clase !== 'INGRESO' && c.clase !== 'GASTO') continue
    const montos = meses
      .map((m) => enDOP(saldo(c, movimientos, { desde: primerDia(m), hasta: ultimoDia(m) }), c.moneda, tasas))
      .filter((m) => m !== 0)
    if (montos.length === 0) continue
    salida.push({
      mes: mesDestino,
      cuentaId: c.id,
      monto: centavos(montos.reduce((a, m) => a + m, 0) / montos.length),
      nota: `Promedio de ${montos.length} ${montos.length === 1 ? 'mes' : 'meses'} con movimiento`,
    })
  }
  return salida
}
