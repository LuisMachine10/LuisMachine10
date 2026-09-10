/**
 * Plan de cuentas propuesto.
 *
 * Es una SUGERENCIA, no un dato guardado: la app la ofrece, tú adoptas lo que
 * sirva y escribes lo tuyo. Igual que las metas del Excel. Los saldos iniciales
 * vienen en cero — esos salen de la libreta, y los pones tú.
 */
import type { Cuenta } from './tipos'

export type CuentaPropuesta = Omit<Cuenta, 'id' | 'saldoInicial' | 'fechaApertura'> & {
  /** Por qué esta cuenta está en la lista. Toda sugerencia dice de dónde sale. */
  porQue: string
}

const p = (
  nombre: string, clase: Cuenta['clase'], grupo: Cuenta['grupo'], porQue: string,
  moneda: Cuenta['moneda'] = 'DOP', seValuaAMercado = false,
): CuentaPropuesta => ({
  nombre, clase, grupo, moneda, seValuaAMercado, ticker: '', activa: true, nota: '', porQue,
})

export const PLAN_SUGERIDO: CuentaPropuesta[] = [
  // --- Activos
  p('Cuenta de banco', 'ACTIVO', 'EFECTIVO', 'La caja de verdad: lo que puedes usar hoy.'),
  p('Efectivo', 'ACTIVO', 'EFECTIVO', 'El efectivo en mano también es caja.'),
  p('Certificado financiero', 'ACTIVO', 'CERTIFICADO', 'Rinde, pero no es caja: no lo puedes usar mañana.'),
  p('Cuenta de corretaje', 'ACTIVO', 'INVERSION', 'El portafolio de acciones.', 'USD', true),
  p('Instrumentos locales', 'ACTIVO', 'INVERSION', 'Lo que tienes en el mercado dominicano.', 'DOP', true),
  p('Préstamos a terceros', 'ACTIVO', 'POR COBRAR', 'Lo que te deben. Si no se registra, se olvida.'),
  p('Vehículo', 'ACTIVO', 'PROPIEDAD', 'Un activo que se deprecia y hay que reemplazar.'),

  // --- Pasivos
  p('Tarjeta de crédito', 'PASIVO', 'TARJETA', 'Lo más exigible y lo más caro. Va primero.'),
  p('Préstamo personal', 'PASIVO', 'PRESTAMO', 'Solo el capital que debes; los intereses son gasto.'),
  p('Préstamo de vehículo', 'PASIVO', 'PRESTAMO', 'Igual: capital aquí, intereses al estado de resultados.'),

  // --- Ingresos
  p('Salario', 'INGRESO', 'INGRESO FIJO', 'El ingreso con el que se presupuesta.'),
  p('Intereses y rendimientos', 'INGRESO', 'INGRESO VARIABLE', 'Lo que produce el capital sin que trabajes.'),
  p('Ganancia realizada en inversiones', 'INGRESO', 'INGRESO VARIABLE', 'Lo que sí vendiste. Dinero de verdad.'),
  p('Ganancia no realizada', 'INGRESO', 'INGRESO VARIABLE', 'Valuación a mercado. Existe en papel, no en caja.'),
  p('Otros ingresos', 'INGRESO', 'INGRESO VARIABLE', 'Lo que entra y no es recurrente.'),

  // --- Gastos fijos
  p('Vivienda', 'GASTO', 'GASTO FIJO', 'Normalmente el renglón más grande. Merece su propia línea.'),
  p('Servicios', 'GASTO', 'GASTO FIJO', 'Luz, agua, internet, teléfono.'),
  p('Seguros', 'GASTO', 'GASTO FIJO', 'Salud, vehículo, vida.'),
  p('Cuotas de préstamos', 'GASTO', 'GASTO FIJO', 'La parte de interés. El capital baja el pasivo, no es gasto.'),
  p('Educación', 'GASTO', 'GASTO FIJO', 'CFA, FMVA, certificaciones: inversión en capital humano.'),

  // --- Gastos variables
  p('Alimentación', 'GASTO', 'GASTO VARIABLE', 'El variable que más se subestima al presupuestar.'),
  p('Transporte', 'GASTO', 'GASTO VARIABLE', 'Combustible, mantenimiento, transporte.'),
  p('Salud', 'GASTO', 'GASTO VARIABLE', 'Consultas, medicamentos, suplementos.'),
  p('Personal y ocio', 'GASTO', 'GASTO VARIABLE', 'Donde se va el dinero que nadie sabe explicar a fin de mes.'),
  p('Otros gastos', 'GASTO', 'GASTO VARIABLE', 'Provisional: si crece, hay que abrirlo en cuentas propias.'),
]
