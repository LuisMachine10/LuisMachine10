// Datos SINTÉTICOS para las pruebas del motor. Cifras redondas inventadas para probar fórmulas:
// no son de Mena ni de nadie (regla de la casa: nada personal en el repositorio).

import { armarFx, type Contexto, type ObservacionFx, type PrecioMercado } from "./posicion";
import { type Activo, type Cierre, cierreVacio, type Parametros, parametrosVacios, type Transaccion } from "./tipos";

export function parametrosEjemplo(): Parametros {
  return {
    ...parametrosVacios(),
    fx: { USD: "60", EUR: "70" },
    fxUpdated: "2026-09-30",
    inflacion: "0.04",
    tasaRetiro: "0.04",
    aporteMensual: "10000",
    horizonte: "2",
    metaFondo: "4",
    metaAhorro: "0.15",
    metaUsoTC: "0.35",
    metaAsignacion: { efectivo: "0.1", ahorros: "0.1", rentafija: "0.5", accionesusa: "0.3" },
    bandaRebalanceo: "0.03",
    maxEmisor: "0.3",
    escenarios: [
      { id: "estres", nom: "Estrés", retorno: "0.04", inflacion: "0.06", deprecFX: "0.06", aporte: "8000" },
      { id: "base", nom: "Base", retorno: "0.08", inflacion: "0.04", deprecFX: "0.03", aporte: "10000" },
    ],
    tarjetas: [{ id: "tc-a", nombre: "Tarjeta A", limite: "20000" }],
    ingresos: [{ id: "in-1", nombre: "Salario", pres: "50000" }],
    fijos: [{ id: "gf-1", nombre: "Alquiler", pres: "15000" }],
    variables: [{ id: "gv-1", nombre: "Comida", pres: "10000" }],
    aportes: [{ id: "ap-1", nombre: "Inversión", pres: "10000" }],
  };
}

export function activosEjemplo(): Activo[] {
  const base = { simbolo: null, venc: null, tipoRF: null, tasa: "0", precio: "1" } as const;
  return [
    { ...base, id: "a1", clase: "efectivo", nombre: "Efectivo", inst: "Billetera", moneda: "DOP", cantidad: "10000" },
    { ...base, id: "a2", clase: "ahorros", nombre: "Ahorros", inst: "Banco A", moneda: "DOP", cantidad: "50000", tasa: "0.05" },
    { ...base, id: "a3", clase: "ahorros", nombre: "Ahorros US$", inst: "Banco A", moneda: "USD", cantidad: "500" },
    { ...base, id: "a4", clase: "rentafija", nombre: "Certificado", inst: "Banco B", moneda: "DOP", cantidad: "100000", tasa: "0.1", venc: "2027-10-15", tipoRF: "acumula" },
    { ...base, id: "a5", clase: "accionesusa", nombre: "Acción X", inst: "Corredor", moneda: "USD", cantidad: "10", precio: "100", simbolo: "XXX" },
  ];
}

export function cierreEjemplo(extra: Partial<Cierre> = {}): Cierre {
  return {
    ...cierreVacio(),
    ingresos: { "in-1": "50000" },
    fijos: { "gf-1": "15000" },
    variables: { "gv-1": "10000" },
    aportes: { "ap-1": "10000" },
    tarjetas: { "tc-a": { uso: "8000", full: true } },
    ...extra,
  };
}

export function contextoEjemplo(op: {
  p?: Parametros;
  activos?: Activo[];
  tx?: Transaccion[];
  cierres?: Record<string, Cierre>;
  usd?: ObservacionFx[];
  precios?: Record<string, PrecioMercado>;
  hoy?: string;
} = {}): Contexto {
  const p = op.p ?? parametrosEjemplo();
  const { fx, anteriorUSD } = armarFx(op.usd ?? [], p);
  return {
    p,
    activos: op.activos ?? activosEjemplo(),
    tx: op.tx ?? [],
    cierres: op.cierres ?? {},
    mercado: { fx, fxAnteriorUSD: anteriorUSD, precios: op.precios ?? {}, referencias: [] },
    hoy: op.hoy ?? "2026-10-15",
  };
}
