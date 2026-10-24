// Modelo del Calendario de Caja. Todos los montos viajan como texto decimal ("1500.50") y se operan
// con big.js: nunca pasan por float.

import type { Fecha } from "./fechas";

export const TIPOS_CUENTA = ["banco", "efectivo", "ahorro", "tarjeta", "prestamo"] as const;
export type TipoCuenta = (typeof TIPOS_CUENTA)[number];

/** Tarjeta y préstamo son deudas: su saldo es lo que se debe (positivo) y su posición interna es negativa. */
export function esDeuda(tipo: TipoCuenta | string | undefined): boolean {
  return tipo === "tarjeta" || tipo === "prestamo";
}

/**
 * Tipo de cada categoría = la línea del estado de resultados donde cae. El orden es el del estado:
 * Ingresos − Costos = Utilidad bruta − Gastos = Utilidad operativa − Gastos financieros + Otros ingresos
 * − Otros gastos = Utilidad neta → destino: Ahorro e inversión (va al Portafolio).
 */
export const TIPOS_CATEGORIA = ["ingreso", "costo", "gasto", "gasto_financiero", "otro_ingreso", "otro_gasto", "ahorro_inversion"] as const;
export type TipoCategoria = (typeof TIPOS_CATEGORIA)[number];

/** Grupos de la versión anterior (hasta oct. 2026). Solo para convertir datos e importar el artefacto. */
export const GRUPOS_V1 = ["ingreso", "fijo", "variable", "ahorro", "deuda"] as const;
export type GrupoV1 = (typeof GRUPOS_V1)[number];

/** Conversión de los grupos viejos (la misma que hace la migración 20261021000400_presupuesto.sql). */
export const TIPO_DESDE_GRUPO: Record<GrupoV1, TipoCategoria> = {
  ingreso: "ingreso",
  fijo: "gasto",
  variable: "gasto",
  ahorro: "ahorro_inversion",
  deuda: "gasto_financiero",
};

/** Las categorías de entrada suman en el estado; las demás restan (o, en ahorro, son destino de la utilidad). */
export function esEntrada(t: TipoCategoria): boolean {
  return t === "ingreso" || t === "otro_ingreso";
}

export const TIPOS_MOVIMIENTO = ["ingreso", "gasto", "transferencia", "pago_tarjeta"] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

export const MONEDAS = ["DOP", "USD"] as const;
export type Moneda = (typeof MONEDAS)[number];

export const FRECUENCIAS = ["mensual", "cada_n", "unica"] as const;
export type Frecuencia = (typeof FRECUENCIAS)[number];

export const NOMBRE_TIPO_CUENTA: Record<TipoCuenta, string> = {
  banco: "Banco",
  efectivo: "Efectivo",
  ahorro: "Ahorro e inversión",
  tarjeta: "Tarjeta de crédito",
  prestamo: "Préstamo",
};

export const NOMBRE_TIPO_CATEGORIA: Record<TipoCategoria, string> = {
  ingreso: "Ingresos",
  costo: "Costos",
  gasto: "Gastos",
  gasto_financiero: "Gastos financieros",
  otro_ingreso: "Otros ingresos",
  otro_gasto: "Otros gastos",
  ahorro_inversion: "Ahorro e inversión",
};

/** Singular, para selectores («Tipo: Gasto»). */
export const NOMBRE_TIPO_CATEGORIA_UNO: Record<TipoCategoria, string> = {
  ingreso: "Ingreso",
  costo: "Costo",
  gasto: "Gasto",
  gasto_financiero: "Gasto financiero",
  otro_ingreso: "Otro ingreso",
  otro_gasto: "Otro gasto",
  ahorro_inversion: "Ahorro e inversión",
};

/** Qué es cada tipo, en palabras de la calle y con ejemplos. */
export const AYUDA_TIPO_CATEGORIA: Record<TipoCategoria, string> = {
  ingreso: "El dinero que te entra por tu trabajo o tu negocio. Ej.: sueldo, quincena, ventas.",
  costo: "Lo que gastas para poder generar ese ingreso. Ej.: mercancía que revendes, materiales, transporte del trabajo.",
  gasto: "El día a día de tu casa y tu vida. Ej.: alquiler, comida, luz, internet, colegio.",
  gasto_financiero: "Lo que pagas por deber dinero. Ej.: intereses de la tarjeta o del préstamo, comisiones del banco.",
  otro_ingreso: "Entradas que no son de tu trabajo. Ej.: un regalo, la venta de algo usado, un reembolso.",
  otro_gasto: "Salidas que no son del día a día. Ej.: una multa, un arreglo inesperado, una donación.",
  ahorro_inversion: "Lo que apartas cada mes de lo que te sobra para tu Portafolio. Ej.: ahorro, certificado, fondo, acciones.",
};

export const NOMBRE_TIPO: Record<TipoMovimiento, string> = {
  ingreso: "Ingreso",
  gasto: "Gasto",
  transferencia: "Mover entre mis cuentas",
  pago_tarjeta: "Pago de tarjeta",
};

export const NOMBRE_FRECUENCIA: Record<Frecuencia, string> = {
  mensual: "Días fijos del mes",
  cada_n: "Cada N días",
  unica: "Una sola vez",
};

export interface ConfigCaja {
  inicio: Fecha;
  colchon: string;
  margen: string;
  /** Tasa general RD$ por US$ que fijó Mena. null = no hay; los montos en US$ sin tasa propia no se aplican. */
  tasaUSD: string | null;
}

export interface Cuenta {
  id: string;
  nombre: string;
  tipo: TipoCuenta;
  /** En tarjeta es la deuda inicial (positiva); internamente la posición es negativa. */
  saldoInicial: string;
  limite: string | null;
  orden: number;
  /**
   * Fila del registro único del Portafolio que es esta cuenta (caja_cuentas.registro_id). Solo al crearla
   * desde el asistente; al leer, el enlace llega aparte (LecturaCaja.enlaces).
   */
  registroId?: string;
}

export interface Categoria {
  id: string;
  nombre: string;
  /** Línea del estado de resultados. */
  tipo: TipoCategoria;
  /**
   * Monto adicional al mes (RD$) que Mena escribe a mano. Lo presupuestado de la categoría es la suma
   * de sus fijos del mes + este adicional. null = nada adicional.
   */
  adicional: string | null;
}

export interface Recurrente {
  id: string;
  nombre: string;
  tipo: TipoMovimiento;
  monto: string;
  moneda: Moneda;
  /** Solo pago_tarjeta: paga el total adeudado en la tarjeta destino ese día. */
  pagoTotal: boolean;
  cuenta: string | null;
  destino: string | null;
  categoria: string | null;
  frecuencia: Frecuencia;
  /** "15, 30": días del mes (frecuencia mensual). El 31 cae el último día en meses más cortos. */
  dias: string;
  cadaN: number | null;
  /** Frecuencia única. */
  fecha: Fecha | null;
  desde: Fecha | null;
  hasta: Fecha | null;
  activo: boolean;
}

export interface Movimiento {
  id: string;
  fecha: Fecha;
  tipo: TipoMovimiento;
  monto: string;
  moneda: Moneda;
  /** Tasa propia del movimiento en US$; si es null se usa la tasa general. */
  tasa: string | null;
  cuenta: string | null;
  destino: string | null;
  categoria: string | null;
  nota: string | null;
  /** Id del recurrente que este movimiento confirma. */
  recurrenteId: string | null;
}

export interface Omitido {
  fecha: Fecha;
  recurrenteId: string;
}

export interface SaldoReal {
  fecha: Fecha;
  cuentaId: string;
  /** Lo que dice el banco. En tarjeta, la deuda (positiva). */
  saldo: string;
}

export interface NotaDia {
  fecha: Fecha;
  nota: string;
}

export interface DatosCaja {
  config: ConfigCaja | null;
  cuentas: Cuenta[];
  categorias: Categoria[];
  recurrentes: Recurrente[];
  movimientos: Movimiento[];
  omitidos: Omitido[];
  saldos: SaldoReal[];
  notas: NotaDia[];
}

export function esUno<T extends string>(lista: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (lista as readonly string[]).includes(v);
}
