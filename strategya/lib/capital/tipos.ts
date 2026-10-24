// Mena Capital · modelo de datos.
//
// Es el mismo modelo que guarda el artefacto «Mena Capital» (parámetros P, ACTIVOS, TX, CIERRES, IPS),
// con una diferencia: todo monto, tasa o cantidad viaja como TEXTO decimal ("60", "0.05", "1234.5")
// y se opera con big.js. Las tasas se guardan como fracción (0.045 = 4.5 %), igual que el artefacto.

/** Número decimal como texto, sin exponente: "1234.5", "-0.05". */
export type Dec = string;

// Las 4 clases de instrumentos de Mena Capital. Los ids son el contrato con la base (CHECK de
// personal.activos, migración 20261017000100_capital_clases) y con metaAsignacion.
export const CLASES = [
  { id: "efectivo", nom: "Efectivo", desc: "Billetera y caja: disponible al instante" },
  { id: "ahorros", nom: "Cuentas de Ahorro", desc: "Cuentas bancarias a la vista" },
  { id: "rentafija", nom: "Renta Fija", desc: "Bonos, certificados, mutuos y fondos de renta fija" },
  { id: "rentavariable", nom: "Renta Variable", desc: "Acciones, ETF y fondos de renta variable" },
] as const;

export type Clase = (typeof CLASES)[number]["id"];
export const IDS_CLASE: readonly Clase[] = CLASES.map((c) => c.id);

/**
 * Nombres de clase que llegan de versiones anteriores del artefacto o escritos a mano, ya
 * normalizados (minúsculas, sin acentos ni espacios, guiones ni puntos). Lo que no esté aquí ni sea
 * un id de CLASES se rechaza: «fondo» a secas o «mixto» son ambiguos y Mena debe elegir la clase.
 */
export const ALIAS_CLASE: Record<string, Clase> = {
  efectivo: "efectivo",
  cash: "efectivo",
  caja: "efectivo",
  billetera: "efectivo",
  ahorros: "ahorros",
  ahorro: "ahorros",
  cuentasdeahorro: "ahorros",
  cuentadeahorro: "ahorros",
  cuentasdeahorros: "ahorros",
  cuentadeahorros: "ahorros",
  ahorrosbancarios: "ahorros",
  cuentaahorro: "ahorros",
  rentafija: "rentafija",
  rentafijard: "rentafija",
  bono: "rentafija",
  bonos: "rentafija",
  certificado: "rentafija",
  certificados: "rentafija",
  certificadofinanciero: "rentafija",
  fondorentafija: "rentafija",
  fondoderentafija: "rentafija",
  fondosderentafija: "rentafija",
  rentavariable: "rentavariable",
  accionesusa: "rentavariable",
  acciones: "rentavariable",
  accion: "rentavariable",
  etf: "rentavariable",
  etfs: "rentavariable",
  fondorentavariable: "rentavariable",
  fondoderentavariable: "rentavariable",
  fondosderentavariable: "rentavariable",
};

/** Clave de búsqueda: «Renta Fija RD» → "rentafijard", «Acciones EE. UU.» → "accioneseeuu". */
export function claveClase(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Traduce cualquier nombre conocido de clase a una de las 4. null = desconocida o ambigua. */
export function normalizarClase(v: unknown): Clase | null {
  if (typeof v !== "string") return null;
  const k = claveClase(v);
  if ((IDS_CLASE as readonly string[]).includes(k)) return k as Clase;
  if (k === "accioneseeuu" || k === "accionesusa") return "rentavariable";
  return ALIAS_CLASE[k] ?? null;
}

export const MONEDAS = ["DOP", "USD", "EUR"] as const;
export type Moneda = (typeof MONEDAS)[number];
export type MonedaExtranjera = Exclude<Moneda, "DOP">;

export const TIPOS_TX = [
  { id: "compra", nom: "Compra" },
  { id: "venta", nom: "Venta" },
  { id: "dividendo", nom: "Dividendo" },
  { id: "interes", nom: "Interés cobrado" },
] as const;
export type TipoTx = (typeof TIPOS_TX)[number]["id"];

export function nombreClase(id: string): string {
  return CLASES.find((c) => c.id === id)?.nom ?? id;
}
export function nombreTipoTx(id: string): string {
  return TIPOS_TX.find((t) => t.id === id)?.nom ?? id;
}

/** Una partida del presupuesto mensual (ingreso, gasto fijo, gasto variable o aporte). */
export interface Partida {
  id: string;
  nombre: string;
  pres: Dec;
}

export interface Tarjeta {
  id: string;
  nombre: string;
  limite: Dec;
}

export interface Escenario {
  id: string;
  nom: string;
  retorno: Dec;
  inflacion: Dec;
  deprecFX: Dec;
  aporte: Dec;
}

export const LISTAS_PRESUPUESTO = ["ingresos", "fijos", "variables", "aportes"] as const;
export type ListaPresupuesto = (typeof LISTAS_PRESUPUESTO)[number];

export interface Parametros {
  /** Tipo de cambio manual (RD$ por unidad). null = no cargado. DOP siempre vale 1. */
  fx: { USD: Dec | null; EUR: Dec | null };
  /** Fecha (AAAA-MM-DD) en que Mena actualizó el tipo de cambio manual. */
  fxUpdated: string | null;
  inflacion: Dec;
  tasaRetiro: Dec;
  aporteMensual: Dec;
  retornoObjetivo: Dec;
  incrAporteAnual: Dec;
  /** Años. */
  horizonte: Dec;
  /** Meses de gasto operativo. */
  metaFondo: Dec;
  metaAhorro: Dec;
  metaUsoTC: Dec;
  metaAsignacion: Record<Clase, Dec>;
  bandaRebalanceo: Dec;
  maxEmisor: Dec;
  escenarios: Escenario[];
  /**
   * Reparto del ahorro presupuestado por clase (fracciones que suman 1). null = no escrito: se usa la meta
   * de asignación de la política.
   */
  planClases: Record<Clase, Dec> | null;
  /** Umbrales de la matriz de riesgo (Ajustes del Portafolio). */
  umbrales: Umbrales;
  tarjetas: Tarjeta[];
  ingresos: Partida[];
  fijos: Partida[];
  variables: Partida[];
  aportes: Partida[];
}

export type TipoRentaFija = "acumula" | "cupon";

/** Cada cuánto paga intereses un instrumento que no los capitaliza dentro de sí. */
export const FRECUENCIAS_PAGO = [
  { id: "mensual", nom: "Cada mes", meses: 1 },
  { id: "trimestral", nom: "Cada 3 meses", meses: 3 },
  { id: "semestral", nom: "Cada 6 meses", meses: 6 },
  { id: "anual", nom: "Cada año", meses: 12 },
  { id: "vencimiento", nom: "Todo al vencer", meses: 0 },
] as const;
export type FrecuenciaPago = (typeof FRECUENCIAS_PAGO)[number]["id"];

/**
 * Plan de cada instrumento para las proyecciones (columnas de personal.activos). null = sin configurar:
 * la pantalla usa un supuesto (ver lib/capital/proyeccion.ts · reglasDe) y lo dice.
 */
export interface PlanInstrumento {
  /** ¿Capitaliza los intereses dentro del instrumento? */
  capitaliza: boolean | null;
  /** Si no capitaliza: cada cuánto paga los intereses. */
  frecuenciaPago: FrecuenciaPago | null;
  /** Si no capitaliza: ¿reinviertes lo que te paga? */
  reinvierte: boolean | null;
  /** Parte (fracción) del aporte mensual de su clase que va a este instrumento. */
  aportePct: Dec | null;
  /** Desde cuándo recibe aportes (AAAA-MM-DD). */
  inicio: string | null;
}

export function planVacio(): PlanInstrumento {
  return { capitaliza: null, frecuenciaPago: null, reinvierte: null, aportePct: null, inicio: null };
}

export interface Activo {
  id: string;
  clase: Clase;
  nombre: string;
  /** Institución o emisor. */
  inst: string;
  /** Símbolo bursátil (solo acciones y ETF). Con él se busca el precio de mercado. */
  simbolo: string | null;
  moneda: Moneda;
  /** Monto o número de acciones. */
  cantidad: Dec;
  /** Precio unitario manual. 1 para saldos. */
  precio: Dec;
  /** Tasa o dividendo anual (fracción). */
  tasa: Dec;
  /** Vencimiento AAAA-MM-DD (renta fija). */
  venc: string | null;
  tipoRF: TipoRentaFija | null;
  /** Registro único: fecha del saldo escrito (saldo al empezar ese día). */
  saldoFecha?: string | null;
  /** Cuentas de ahorro: «corriente» (para el día a día) o «ahorro». */
  subtipo?: string | null;
  /** Id de la cuenta del Presupuesto enlazada (si el Presupuesto la usa). */
  cajaId?: string | null;
  /** Lo que Mena escribió (si el Presupuesto la mueve, cantidad = saldo vigente). */
  cantidadEscrita?: Dec;
  plan?: PlanInstrumento;
}

export interface Transaccion {
  id: string;
  activoId: string;
  simbolo: string;
  tipo: TipoTx;
  fecha: string | null;
  cantidad: Dec;
  precio: Dec;
  comision: Dec;
  moneda: Moneda | null;
}

export interface UsoTarjeta {
  uso: Dec | null;
  /** false = no se pagó en full ese mes. */
  full: boolean;
}

export interface Deudas {
  tc: Dec | null;
  prestamos: Dec | null;
  otras: Dec | null;
}

/** Foto del patrimonio congelada al cerrar el mes. */
export interface Foto {
  activos: Dec;
  pasivos: Dec;
  patrimonio: Dec;
  liquidos: Dec;
  ingresoPasivoAnual: Dec;
  fecha: string | null;
  fx: { USD: Dec | null; EUR: Dec | null } | null;
}

export interface Cierre {
  /** true = mes histórico cargado solo con totales, sin desglose por partida. */
  agregado: boolean;
  totIngresos: Dec | null;
  totFijos: Dec | null;
  totVariables: Dec | null;
  totAportes: Dec | null;
  ingresos: Record<string, Dec | null>;
  fijos: Record<string, Dec | null>;
  variables: Record<string, Dec | null>;
  aportes: Record<string, Dec | null>;
  tarjetas: Record<string, UsoTarjeta>;
  deudas: Deudas;
  snap: Foto | null;
  cerrado: boolean;
  nota: string | null;
}

export const SECCIONES_IPS = [
  ["horizonte", "Horizonte"],
  ["objetivo", "Objetivo"],
  ["tolerancia", "Tolerancia a pérdida"],
  ["liquidez", "Requisito de liquidez"],
  ["restricciones", "Restricciones"],
  ["rebalanceo", "Regla de rebalanceo"],
  ["emisores", "Límites de concentración"],
  ["revision", "Revisión"],
] as const;
export type SeccionIps = (typeof SECCIONES_IPS)[number][0];

export type Ips = Record<SeccionIps, string> & {
  editadoPor: "borrador" | "mena";
  revisadoEl: string | null;
};

/** Mes en formato AAAA-MM. */
export type Mes = string;
export type Cierres = Record<Mes, Cierre>;

/** Umbrales de la matriz de riesgo. Fracciones salvo colchonMeses (meses de gasto). */
export interface Umbrales {
  colchonMeses: Dec;
  maxInstrumento: Dec;
  maxEmisor: Dec;
  dolarMin: Dec;
  dolarMax: Dec;
  /** Gasto real sobre lo presupuestado a partir del cual el riesgo es alto. */
  sobreGasto: Dec;
  /** Deuda de tarjetas sobre el ingreso mensual a partir de la cual el riesgo es alto. */
  deudaTarjetas: Dec;
}

/** Los de fábrica (pedido de Mena, oct. 2026). Se editan en Ajustes del Portafolio. */
export function umbralesPorDefecto(): Umbrales {
  return { colchonMeses: "6", maxInstrumento: "0.25", maxEmisor: "0.4", dolarMin: "0.2", dolarMax: "0.5", sobreGasto: "0.1", deudaTarjetas: "0.3" };
}

/** Clases del registro único que no son inversiones: otros activos y deudas. */
export const CLASES_OTRAS = [
  { id: "otros", nom: "Otros activos", desc: "Vehículo, inmueble u otro bien con valor" },
  { id: "tarjeta", nom: "Tarjetas de crédito", desc: "Lo que debes en tus tarjetas" },
  { id: "prestamo", nom: "Préstamos", desc: "Préstamos con saldo, cuota y tasa" },
  { id: "deuda", nom: "Otras deudas", desc: "Lo que debes y no es tarjeta ni préstamo" },
] as const;
export type ClaseOtra = (typeof CLASES_OTRAS)[number]["id"];
export type ClaseRegistro = Clase | ClaseOtra;
export const CLASES_DEUDA: readonly ClaseRegistro[] = ["tarjeta", "prestamo", "deuda"];
export function esClaseDeuda(c: string): boolean {
  return (CLASES_DEUDA as readonly string[]).includes(c);
}
export function esClaseInversion(c: string): c is Clase {
  return (IDS_CLASE as readonly string[]).includes(c);
}
export function nombreClaseRegistro(id: string): string {
  return CLASES_OTRAS.find((c) => c.id === id)?.nom ?? nombreClase(id);
}

/** Parámetros neutros: sin cifras de nadie. Lo que falte se ve como «sin configurar». */
export function parametrosVacios(): Parametros {
  return {
    fx: { USD: null, EUR: null },
    fxUpdated: null,
    inflacion: "0",
    tasaRetiro: "0",
    aporteMensual: "0",
    retornoObjetivo: "0",
    incrAporteAnual: "0",
    horizonte: "0",
    metaFondo: "0",
    metaAhorro: "0",
    metaUsoTC: "0",
    metaAsignacion: { efectivo: "0", ahorros: "0", rentafija: "0", rentavariable: "0" },
    bandaRebalanceo: "0",
    maxEmisor: "0",
    escenarios: [],
    planClases: null,
    umbrales: umbralesPorDefecto(),
    tarjetas: [],
    ingresos: [],
    fijos: [],
    variables: [],
    aportes: [],
  };
}

export function ipsVacia(): Ips {
  return {
    horizonte: "",
    objetivo: "",
    tolerancia: "",
    liquidez: "",
    restricciones: "",
    rebalanceo: "",
    emisores: "",
    revision: "",
    editadoPor: "borrador",
    revisadoEl: null,
  };
}

export function cierreVacio(): Cierre {
  return {
    agregado: false,
    totIngresos: null,
    totFijos: null,
    totVariables: null,
    totAportes: null,
    ingresos: {},
    fijos: {},
    variables: {},
    aportes: {},
    tarjetas: {},
    deudas: { tc: null, prestamos: null, otras: null },
    snap: null,
    cerrado: false,
    nota: null,
  };
}
