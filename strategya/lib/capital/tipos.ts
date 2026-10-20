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
  tarjetas: Tarjeta[];
  ingresos: Partida[];
  fijos: Partida[];
  variables: Partida[];
  aportes: Partida[];
}

export type TipoRentaFija = "acumula" | "cupon";

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
