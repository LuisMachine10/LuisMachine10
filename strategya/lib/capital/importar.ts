// Importación del archivo de Mena Capital.
//
// FORMATO (el mismo que guarda el artefacto «Mena Capital»; cualquier clave puede faltar):
//
//   {
//     "parametros":    { fx: {DOP, USD, EUR}, fxUpdated, inflacion, tasaRetiro, aporteMensual,
//                        retornoObjetivo, incrAporteAnual, horizonte, metaFondo, metaAhorro, metaUsoTC,
//                        metaAsignacion: {efectivo, ahorros, rentafija, accionesusa},
//                        bandaRebalanceo, maxEmisor,
//                        escenarios: [{id, nom, retorno, inflacion, deprecFX, aporte}],
//                        tarjetas: [{id, nombre, limite}],
//                        ingresos|fijos|variables|aportes: [{id, nombre, pres}] },
//     "activos":       [{ id, clase: efectivo|ahorros|rentafija|accionesusa, nombre, inst, simbolo?,
//                         moneda: DOP|USD|EUR, cantidad, precio, tasa, venc?: AAAA-MM-DD,
//                         tipoRF?: acumula|cupon }],
//     "transacciones": [{ id, activoId, simbolo, tipo: compra|venta|dividendo|interes, fecha: AAAA-MM-DD,
//                         cantidad, precio, comision, moneda }],
//     "cierres":       { "AAAA-MM": { agregado?, totIngresos?, totFijos?, totVariables?, totAportes?,
//                         ingresos?: {idPartida: monto}, fijos?, variables?, aportes?,
//                         tarjetas?: {idTarjeta: {uso, full}}, deudas?: {tc, prestamos, otras},
//                         snap?: {activos, pasivos, patrimonio, liquidos, ingresoPasivoAnual, fecha, fx: {USD, EUR}},
//                         cerrado?, nota? } },
//     "ips":           { horizonte, objetivo, tolerancia, liquidez, restricciones, rebalanceo, emisores,
//                        revision, editadoPor: borrador|mena, revisadoEl? }
//   }
//
// Tasas como fracción (0.045 = 4.5 %). Los números pueden venir como número JSON o como texto; se
// leen SIN pasar por float (jsonExacto) y se guardan como texto decimal. También se aceptan los
// nombres del almacenamiento local del artefacto (P, ACTIVOS, TX, CIERRES, IPS); MERCADO se ignora
// (los datos de mercado los trae Strategya de sus fuentes).
//
// Al confirmar, cada sección PRESENTE en el archivo reemplaza por completo a la guardada; las secciones
// ausentes no se tocan. Todo ocurre en una sola transacción (personal.importar_capital).

import { jsonExacto } from "../../supabase/functions/_shared/json";
import {
  esObjeto,
  Registro,
  validarActivos,
  validarCierres,
  validarIps,
  validarParametros,
  validarTransacciones,
} from "./validar";
import type { Activo, Cierres, Ips, Parametros, Transaccion } from "./tipos";

export const TAMANO_MAXIMO = 2_000_000;

export interface DatosImportados {
  parametros?: Parametros;
  activos?: Activo[];
  transacciones?: Transaccion[];
  cierres?: Cierres;
  ips?: Ips;
}

export interface ResumenImportacion {
  parametros: { tarjetas: number; partidas: number; escenarios: number; fxManual: string[] } | null;
  activos: { total: number; porClase: Record<string, number>; conSimbolo: string[] } | null;
  transacciones: { total: number; desde: string | null; hasta: string | null; sinActivo: number } | null;
  cierres: { total: number; desde: string | null; hasta: string | null; conFoto: number; cerrados: number } | null;
  ips: { secciones: number; editadoPor: string } | null;
}

export interface AnalisisArchivo {
  ok: boolean;
  errores: string[];
  avisos: string[];
  datos: DatosImportados;
  resumen: ResumenImportacion;
}

const ALIAS: Record<string, keyof DatosImportados> = {
  parametros: "parametros",
  P: "parametros",
  activos: "activos",
  ACTIVOS: "activos",
  transacciones: "transacciones",
  TX: "transacciones",
  cierres: "cierres",
  CIERRES: "cierres",
  ips: "ips",
  IPS: "ips",
};

const IGNORADAS_EN_SILENCIO = new Set(["MERCADO"]);

function vacio(): ResumenImportacion {
  return { parametros: null, activos: null, transacciones: null, cierres: null, ips: null };
}

export function analizarArchivo(contenido: string): AnalisisArchivo {
  const r = new Registro();
  const fallo = (msg: string): AnalisisArchivo => ({ ok: false, errores: [msg], avisos: [], datos: {}, resumen: vacio() });

  if (contenido.length > TAMANO_MAXIMO) return fallo(`El archivo pesa más de ${TAMANO_MAXIMO / 1_000_000} MB.`);
  let crudo: unknown;
  try {
    crudo = jsonExacto(contenido.replace(/^﻿/, ""));
  } catch (e) {
    return fallo(`El archivo no es JSON válido: ${(e as Error).message}`);
  }
  if (!esObjeto(crudo)) return fallo("El archivo debe ser un objeto JSON con las claves parametros, activos, transacciones, cierres e ips.");

  const fuente: Partial<Record<keyof DatosImportados, unknown>> = {};
  for (const [k, v] of Object.entries(crudo)) {
    const destino = ALIAS[k];
    if (!destino) {
      if (!IGNORADAS_EN_SILENCIO.has(k)) r.aviso("archivo", `clave «${k.slice(0, 30)}» ignorada`);
      else r.aviso("archivo", `«${k}» se ignora: los datos de mercado vienen de las fuentes de Strategya`);
      continue;
    }
    if (destino in fuente) {
      r.error("archivo", `la sección ${destino} viene dos veces`);
      continue;
    }
    fuente[destino] = v;
  }
  if (!Object.keys(fuente).length) return fallo("El archivo no trae ninguna sección reconocida (parametros, activos, transacciones, cierres, ips).");

  const datos: DatosImportados = {};
  const resumen = vacio();

  if ("parametros" in fuente) {
    const p = validarParametros(fuente.parametros, r);
    datos.parametros = p;
    resumen.parametros = {
      tarjetas: p.tarjetas.length,
      partidas: p.ingresos.length + p.fijos.length + p.variables.length + p.aportes.length,
      escenarios: p.escenarios.length,
      fxManual: (["USD", "EUR"] as const).filter((m) => p.fx[m] !== null),
    };
  }
  if ("activos" in fuente) {
    const a = validarActivos(fuente.activos, r);
    datos.activos = a;
    const porClase: Record<string, number> = {};
    for (const x of a) porClase[x.clase] = (porClase[x.clase] ?? 0) + 1;
    resumen.activos = { total: a.length, porClase, conSimbolo: [...new Set(a.map((x) => x.simbolo).filter((s): s is string => !!s))].sort() };
  }
  if ("transacciones" in fuente) {
    const t = validarTransacciones(fuente.transacciones, r);
    datos.transacciones = t;
    const fechas = t.map((x) => x.fecha).filter((f): f is string => !!f).sort();
    const ids = new Set((datos.activos ?? []).map((a) => a.id));
    const sinActivo = datos.activos ? t.filter((x) => !ids.has(x.activoId)).length : 0;
    if (sinActivo) r.aviso("transacciones", `${sinActivo} transacción(es) apuntan a un activo que no está en el archivo (se guardan igual, como «instrumento eliminado»)`);
    resumen.transacciones = { total: t.length, desde: fechas[0] ?? null, hasta: fechas.at(-1) ?? null, sinActivo };
  }
  if ("cierres" in fuente) {
    const c = validarCierres(fuente.cierres, r);
    datos.cierres = c;
    const meses = Object.keys(c).sort();
    resumen.cierres = {
      total: meses.length,
      desde: meses[0] ?? null,
      hasta: meses.at(-1) ?? null,
      conFoto: meses.filter((m) => c[m].snap).length,
      cerrados: meses.filter((m) => c[m].cerrado).length,
    };
  }
  if ("ips" in fuente) {
    const i = validarIps(fuente.ips, r);
    datos.ips = i;
    resumen.ips = { secciones: (["horizonte", "objetivo", "tolerancia", "liquidez", "restricciones", "rebalanceo", "emisores", "revision"] as const).filter((k) => i[k]).length, editadoPor: i.editadoPor };
  }

  return { ok: r.ok, errores: r.errores, avisos: r.avisos, datos, resumen };
}

/** Argumento de personal.importar_capital(p_datos): solo las secciones presentes. Columnas de la base. */
export function cargaParaBase(d: DatosImportados): Record<string, unknown> {
  const carga: Record<string, unknown> = {};
  if (d.parametros) carga.parametros = d.parametros;
  if (d.activos) carga.activos = d.activos.map((a, i) => activoAFila(a, i));
  if (d.transacciones) carga.transacciones = d.transacciones.map(transaccionAFila);
  if (d.cierres) carga.cierres = Object.entries(d.cierres).map(([mes, datos]) => ({ mes, datos }));
  if (d.ips) carga.ips = d.ips;
  return carga;
}

export interface FilaActivo {
  id: string;
  clase: string;
  nombre: string;
  institucion: string;
  simbolo: string | null;
  moneda: string;
  cantidad: string;
  precio: string;
  tasa: string;
  vencimiento: string | null;
  tipo_rf: string | null;
  orden: number;
}

export function activoAFila(a: Activo, orden = 0): FilaActivo {
  return {
    id: a.id,
    clase: a.clase,
    nombre: a.nombre,
    institucion: a.inst,
    simbolo: a.simbolo,
    moneda: a.moneda,
    cantidad: a.cantidad,
    precio: a.precio,
    tasa: a.tasa,
    vencimiento: a.venc,
    tipo_rf: a.tipoRF,
    orden,
  };
}

export function filaAActivo(f: FilaActivo): Activo {
  return {
    id: f.id,
    clase: f.clase as Activo["clase"],
    nombre: f.nombre,
    inst: f.institucion ?? "",
    simbolo: f.simbolo,
    moneda: f.moneda as Activo["moneda"],
    cantidad: f.cantidad,
    precio: f.precio,
    tasa: f.tasa,
    venc: f.vencimiento,
    tipoRF: (f.tipo_rf as Activo["tipoRF"]) ?? null,
  };
}

export interface FilaTransaccion {
  id: string;
  activo_id: string;
  simbolo: string;
  tipo: string;
  fecha: string | null;
  cantidad: string;
  precio: string;
  comision: string;
  moneda: string | null;
}

export function transaccionAFila(t: Transaccion): FilaTransaccion {
  return {
    id: t.id,
    activo_id: t.activoId,
    simbolo: t.simbolo,
    tipo: t.tipo,
    fecha: t.fecha,
    cantidad: t.cantidad,
    precio: t.precio,
    comision: t.comision,
    moneda: t.moneda,
  };
}

export function filaATransaccion(f: FilaTransaccion): Transaccion {
  return {
    id: f.id,
    activoId: f.activo_id,
    simbolo: f.simbolo ?? "",
    tipo: f.tipo as Transaccion["tipo"],
    fecha: f.fecha,
    cantidad: f.cantidad,
    precio: f.precio,
    comision: f.comision,
    moneda: (f.moneda as Transaccion["moneda"]) ?? null,
  };
}

/** Exportación en el mismo formato que se importa (números como texto decimal exacto). */
export function exportar(d: Required<Omit<DatosImportados, "parametros" | "ips">> & { parametros: Parametros | null; ips: Ips | null }): string {
  const salida: Record<string, unknown> = {};
  if (d.parametros) salida.parametros = { ...d.parametros, fx: { DOP: "1", ...d.parametros.fx } };
  salida.activos = d.activos;
  salida.transacciones = d.transacciones;
  salida.cierres = d.cierres;
  if (d.ips) salida.ips = d.ips;
  return JSON.stringify(salida, null, 2);
}
