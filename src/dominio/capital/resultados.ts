/**
 * Estado de resultados del mes: qué entró, qué salió, qué quedó.
 *
 * Separa lo realizado de lo no realizado. Una acción que subió y no vendiste te
 * hizo más rico, pero no te dio con qué pagar la luz — y la tasa de ahorro que
 * se calcula sobre ganancias no realizadas es una tasa de ahorro que miente.
 */
import { enDOP, saldo } from './cuentas'
import { primerDia, ultimoDia } from './meses'
import type { Cuenta, Grupo, MesISO, Movimiento, Tasas } from './tipos'
import { centavos } from './tipos'

export interface RenglonResultado {
  cuentaId: number
  nombre: string
  grupo: Grupo
  /** En pesos, a la tasa del estado. */
  monto: number
  /** Qué tanto del total de su lado representa. Para ver de un vistazo qué manda. */
  pesoPct: number
}

export interface EstadoResultados {
  mes: MesISO
  tasas: Tasas
  ingresos: RenglonResultado[]
  gastos: RenglonResultado[]
  ingresoFijo: number
  ingresoVariable: number
  totalIngresos: number
  gastoFijo: number
  gastoVariable: number
  totalGastos: number
  /** Ingresos menos gastos, todo incluido. */
  resultado: number
  /** Ganancia o pérdida por valuación a mercado: existe en papel, no en caja. */
  noRealizado: number
  /** El resultado que sí se convirtió en dinero disponible. */
  resultadoRealizado: number
  /** resultadoRealizado / ingresos realizados. `null` si no hubo ingresos. */
  tasaAhorro: number | null
}

function renglones(
  cuentas: Cuenta[],
  movimientos: Movimiento[],
  clase: 'INGRESO' | 'GASTO',
  mes: MesISO,
  tasas: Tasas,
): RenglonResultado[] {
  const ventana = { desde: primerDia(mes), hasta: ultimoDia(mes) }
  const crudos = cuentas
    .filter((c) => c.clase === clase)
    .map((c) => ({
      cuentaId: c.id,
      nombre: c.nombre,
      grupo: c.grupo,
      monto: enDOP(saldo(c, movimientos, ventana), c.moneda, tasas),
      pesoPct: 0,
    }))
    .filter((r) => r.monto !== 0)
  const total = crudos.reduce((a, r) => a + r.monto, 0)
  for (const r of crudos) r.pesoPct = total !== 0 ? centavos((r.monto / total) * 100) : 0
  return crudos.sort((a, b) => b.monto - a.monto)
}

/** Lo que movieron los asientos de valuación en el mes: el papel, no la caja. */
function noRealizadoDelMes(
  cuentas: Cuenta[],
  movimientos: Movimiento[],
  mes: MesISO,
  tasas: Tasas,
): number {
  const desde = primerDia(mes)
  const hasta = ultimoDia(mes)
  const porId = new Map(cuentas.map((c) => [c.id, c]))
  let neto = 0
  for (const mov of movimientos) {
    if (mov.origen !== 'valuacion') continue
    if (mov.fecha < desde || mov.fecha > hasta) continue
    const cDebe = porId.get(mov.debe)
    const cHaber = porId.get(mov.haber)
    if (cHaber?.clase === 'INGRESO') neto += enDOP(mov.montoHaber ?? mov.monto, cHaber.moneda, tasas)
    if (cDebe?.clase === 'GASTO') neto -= enDOP(mov.monto, cDebe.moneda, tasas)
  }
  return centavos(neto)
}

export function estadoResultados(
  cuentas: Cuenta[],
  movimientos: Movimiento[],
  mes: MesISO,
  tasas: Tasas,
): EstadoResultados {
  const ingresos = renglones(cuentas, movimientos, 'INGRESO', mes, tasas)
  const gastos = renglones(cuentas, movimientos, 'GASTO', mes, tasas)
  const suma = (rs: RenglonResultado[], grupo: Grupo) =>
    centavos(rs.filter((r) => r.grupo === grupo).reduce((a, r) => a + r.monto, 0))

  const totalIngresos = centavos(ingresos.reduce((a, r) => a + r.monto, 0))
  const totalGastos = centavos(gastos.reduce((a, r) => a + r.monto, 0))
  const resultado = centavos(totalIngresos - totalGastos)
  const noRealizado = noRealizadoDelMes(cuentas, movimientos, mes, tasas)
  const resultadoRealizado = centavos(resultado - noRealizado)
  const ingresosRealizados = centavos(totalIngresos - Math.max(noRealizado, 0))

  return {
    mes,
    tasas,
    ingresos,
    gastos,
    ingresoFijo: suma(ingresos, 'INGRESO FIJO'),
    ingresoVariable: suma(ingresos, 'INGRESO VARIABLE'),
    totalIngresos,
    gastoFijo: suma(gastos, 'GASTO FIJO'),
    gastoVariable: suma(gastos, 'GASTO VARIABLE'),
    totalGastos,
    resultado,
    noRealizado,
    resultadoRealizado,
    tasaAhorro: ingresosRealizados > 0 ? centavos((resultadoRealizado / ingresosRealizados) * 100) : null,
  }
}

export function serieResultados(
  cuentas: Cuenta[],
  movimientos: Movimiento[],
  meses: MesISO[],
  tasas: Tasas,
): EstadoResultados[] {
  return meses.map((m) => estadoResultados(cuentas, movimientos, m, tasas))
}

export interface PromedioMensual {
  meses: number
  ingresos: number
  gastos: number
  gastoFijo: number
  gastoVariable: number
  resultado: number
  tasaAhorro: number | null
}

/**
 * El promedio de todas las entradas. Un mes suelto no dice nada — el aguinaldo
 * infla diciembre y el ITBIS hunde a otro. La métrica es el promedio.
 *
 * Solo cuenta los meses con movimiento: un mes sin registrar no es un mes en
 * cero, igual que en el resto del sistema.
 */
export function promedioMensual(serie: EstadoResultados[]): PromedioMensual {
  const conDatos = serie.filter((e) => e.totalIngresos !== 0 || e.totalGastos !== 0)
  const n = conDatos.length
  if (n === 0) {
    return { meses: 0, ingresos: 0, gastos: 0, gastoFijo: 0, gastoVariable: 0, resultado: 0, tasaAhorro: null }
  }
  const prom = (f: (e: EstadoResultados) => number) => centavos(conDatos.reduce((a, e) => a + f(e), 0) / n)
  const ingresos = prom((e) => e.totalIngresos)
  const resultado = prom((e) => e.resultadoRealizado)
  return {
    meses: n,
    ingresos,
    gastos: prom((e) => e.totalGastos),
    gastoFijo: prom((e) => e.gastoFijo),
    gastoVariable: prom((e) => e.gastoVariable),
    resultado,
    tasaAhorro: ingresos > 0 ? centavos((resultado / ingresos) * 100) : null,
  }
}
