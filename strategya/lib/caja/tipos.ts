// Modelo del Calendario de Caja. Todos los montos viajan como texto decimal ("1500.50") y se operan
// con big.js: nunca pasan por float.

import type { Fecha } from "./fechas";

export const TIPOS_CUENTA = ["banco", "efectivo", "ahorro", "tarjeta"] as const;
export type TipoCuenta = (typeof TIPOS_CUENTA)[number];

export const GRUPOS = ["ingreso", "fijo", "variable", "ahorro", "deuda"] as const;
export type Grupo = (typeof GRUPOS)[number];

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
};

export const NOMBRE_GRUPO: Record<Grupo, string> = {
  ingreso: "Ingresos",
  fijo: "Gastos fijos",
  variable: "Gastos variables",
  ahorro: "Ahorro e inversión",
  deuda: "Deudas",
};

export const NOMBRE_TIPO: Record<TipoMovimiento, string> = {
  ingreso: "Ingreso",
  gasto: "Gasto",
  transferencia: "Transferencia",
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
}

export interface Categoria {
  id: string;
  nombre: string;
  grupo: Grupo;
  /** Presupuesto mensual en RD$. null = sin presupuesto. */
  presupuesto: string | null;
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
