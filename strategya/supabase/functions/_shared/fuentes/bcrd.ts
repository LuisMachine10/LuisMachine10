// Banco Central de la República Dominicana (BCRD).
//
// Dos tareas:
//  · bcrd-portada: la portada (https://www.bancentral.gov.do/) trae el dólar de referencia del día
//    (compra y venta con su fecha), la inflación del último mes (general y subyacente) y las tasas
//    promedio ponderado activa y pasiva de los bancos múltiples.
//  · bcrd-excel: los archivos oficiales de estadísticas: tasa del dólar (historial diario), TPM y las
//    tasas activas y pasivas por sector y plazo, en moneda nacional y extranjera.
//
// Estructura confirmada con descargas reales del 15 oct 2026 (pruebas/muestras/bcrd/):
//  · TASA_DOLAR_REFERENCIA_MC.xlsx, hoja «Diaria»: Año | Mes (Ene…Dic) | Día | Compra | Venta,
//    encabezado en la fila 3, una fila por día hábil desde 1991. Cifras con 4 decimales («0.0000»).
//  · Serie_TPM.xlsx, hoja «Tasas»: Año (solo en la primera fila de cada año) | Mes | TPM | Depósito |
//    Préstamo… ; FRACCIÓN con formato «0.00%» (0.055 = 5.50 %). Notas al pie desde la fila 281.
//  · tasas_activas_*.xlsx (cuadros V.4 y V.5): por sector; Consumo se divide en «Tarjeta de Crédito»
//    y «Otros», Inmobiliarias en «Vivienda» y «Otros». Mensual, fracción con formato «0.00%».
//  · tasas_pasivas_*.xlsx (cuadros V.6 y V.7): operaciones nuevas, Ahorro y Plazo (un mes, seis meses,
//    un año, más de un año). Las filas de 2001 están en PORCENTAJE con formato «0.00» y las recientes en
//    fracción con «0.00%»: la unidad se decide celda por celda con su formato, nunca adivinando.

import Big from "big.js";
import type { ContextoTarea, FilaObservacion, Tarea } from "../ingesta.ts";
import { type CeldaXlsx, type HojaXlsx, leerXlsx, type LibroXlsx, numeroExcel, serialAFecha, valorVisible } from "../xlsx.ts";
import { crearObtenerBytes, type ObtenerBytes } from "./descarga-binaria.ts";
import {
  enRango,
  fechaEnTexto,
  fechaIso,
  finDeMes,
  hoyRD,
  inicioDeMes,
  mesEnTexto,
  mesesAtras,
  numeroMes,
  numeroPagina,
  seccion,
  textoPlano,
} from "./rd-comun.ts";

export const URL_PORTADA_BCRD = "https://www.bancentral.gov.do/";
const CDN = "https://cdn.bancentral.gov.do/documents/estadisticas";
export const URL_DOLAR_XLSX = `${CDN}/mercado-cambiario/documents/TASA_DOLAR_REFERENCIA_MC.xlsx`;
export const urlMonetario = (archivo: string) => `${CDN}/sector-monetario-y-financiero/documents/${archivo}`;
export const URL_TPM_XLSX = urlMonetario("Serie_TPM.xlsx");

// ---------------------------------------------------------------------------
// Portada
// ---------------------------------------------------------------------------

export interface LecturaBcrd {
  filas: FilaObservacion[];
  advertencias: string[];
  detalle: Record<string, unknown>;
}

/** Rango plausible del dólar en RD$. Fuera de él, el dato se descarta y se avisa. */
const DOLAR_MIN = 5;
const DOLAR_MAX = 200;

/** Valor en el `<h5>` que sigue a `<small>etiqueta</small>`. */
function h5Tras(html: string, etiqueta: string): string | null {
  const m = new RegExp(`<small>\\s*${etiqueta}\\s*</small>\\s*<h5>([\\s\\S]*?)</h5>`, "i").exec(html);
  return m ? textoPlano(m[1]) : null;
}

/** Porcentaje de la fila cuyo enlace tiene alt='etiqueta': `<td class="text-right">5.12%</td>`. */
function porcentajeFila(html: string, etiqueta: string): string | null {
  const m = new RegExp(`alt='${etiqueta}'[\\s\\S]*?<td class="text-right">([^<]*)</td>`, "i").exec(html);
  return m ? numeroPagina(m[1]) : null;
}

/** Mes del bloque: `<span class='text-bolder-gb'>Septiembre 2026</span>`. */
function mesDelBloque(html: string): { anio: number; mes: number } | null {
  const m = /text-bolder-gb'>([^<]+)</.exec(html);
  return m ? mesEnTexto(textoPlano(m[1])) : null;
}

export function parsearPortadaBcrd(html: string, url = URL_PORTADA_BCRD): LecturaBcrd {
  const filas: FilaObservacion[] = [];
  const advertencias: string[] = [];
  const detalle: Record<string, unknown> = {};

  if (!/bancentral|Banco Central/i.test(html)) throw new Error("Formato inesperado: no parece la portada del BCRD");

  // Dólar de referencia del día
  const bloqueDolar = seccion(html, /alt='Tipo de cambio'/i, /alt='Reservas internacionales'/i);
  if (!bloqueDolar) {
    advertencias.push("No se encontró el bloque «Tipo de cambio» en la portada");
  } else {
    const fechaTexto = /text-bolder-gb'>([^<]+)</.exec(bloqueDolar)?.[1] ?? "";
    const fecha = fechaEnTexto(textoPlano(fechaTexto));
    const compra = numeroPagina(h5Tras(bloqueDolar, "Compra") ?? undefined);
    const venta = numeroPagina(h5Tras(bloqueDolar, "Venta") ?? undefined);
    if (!fecha) advertencias.push(`Dólar: fecha ilegible «${textoPlano(fechaTexto)}»`);
    else if (!compra || !venta) advertencias.push("Dólar: compra o venta ilegible");
    else if (!enRango(compra, DOLAR_MIN, DOLAR_MAX) || !enRango(venta, DOLAR_MIN, DOLAR_MAX)) {
      advertencias.push(`Dólar fuera de rango (compra ${compra}, venta ${venta}): descartado`);
    } else if (new Big(venta).lt(compra)) {
      advertencias.push(`Dólar: la venta (${venta}) es menor que la compra (${compra}): descartado`);
    } else {
      const urlDolar = "https://www.bancentral.gov.do/a/d/2538-mercado-cambiario";
      filas.push({ serie_id: "USDDOP_COMPRA", valor: compra, fecha_dato: fecha, url_dato: urlDolar });
      filas.push({ serie_id: "USDDOP_VENTA", valor: venta, fecha_dato: fecha, url_dato: urlDolar });
      detalle.fecha_dolar = fecha;
    }
  }

  // Inflación (variación % del IPC): interanual del último mes publicado
  const bloqueInflacion = seccion(html, /alt='Inflación'/i, /alt='Inflación subyacente'/i);
  const bloqueSubyacente = seccion(html, /alt='Inflación subyacente'/i, /<!-- Inflación Ends -->|Monetarias/i);
  const urlIpc = "https://cdn.bancentral.gov.do/documents/estadisticas/precios/documents/ipc_base_2019-2020.xls";
  for (const [bloque, serie, nombre, urlDato] of [
    [bloqueInflacion, "INFLACION_RD", "Inflación", urlIpc],
    [bloqueSubyacente, "INFLACION_SUB_RD", "Inflación subyacente",
      "https://cdn.bancentral.gov.do/documents/estadisticas/precios/documents/ipc_subyacente_base_2019-2020.xlsx"],
  ] as const) {
    if (!bloque) {
      advertencias.push(`No se encontró el bloque «${nombre}» en la portada`);
      continue;
    }
    const mes = mesDelBloque(bloque);
    const interanual = porcentajeFila(bloque, "Interanual");
    if (!mes || !interanual) {
      advertencias.push(`${nombre}: mes o variación interanual ilegible`);
    } else if (!enRango(interanual, -20, 100)) {
      advertencias.push(`${nombre}: ${interanual}% fuera de rango, descartado`);
    } else {
      filas.push({ serie_id: serie, valor: interanual, fecha_dato: finDeMes(mes.anio, mes.mes), url_dato: urlDato });
      if (serie === "INFLACION_RD") detalle.mes_inflacion = finDeMes(mes.anio, mes.mes);
    }
  }

  // Tasas de interés promedio ponderado de los bancos múltiples (activa y pasiva)
  const bloqueTasas = seccion(html, /<strong>Tasas de interés<\/strong>/i, /alt='Préstamos privados'/i);
  if (!bloqueTasas) {
    advertencias.push("No se encontró el bloque «Tasas de interés» en la portada");
  } else {
    const mes = mesDelBloque(bloqueTasas);
    const activa = porcentajeFila(bloqueTasas, "Activa");
    const pasiva = porcentajeFila(bloqueTasas, "Pasiva");
    if (!mes) advertencias.push("Tasas de interés: mes ilegible");
    else {
      const fecha = finDeMes(mes.anio, mes.mes);
      for (const [serie, valor, archivo] of [
        ["TASA_ACT_MN_PROMEDIO", activa, "tbm_activad.xlsx"],
        ["TASA_PAS_MN_PROMEDIO", pasiva, "tbm_pasivad.xlsx"],
      ] as const) {
        if (!valor) advertencias.push(`${serie}: valor ilegible`);
        else if (!enRango(valor, 0, 100)) advertencias.push(`${serie}: ${valor}% fuera de rango, descartado`);
        else filas.push({ serie_id: serie, valor, fecha_dato: fecha, url_dato: urlMonetario(archivo) });
      }
      detalle.mes_tasas = fecha;
    }
  }
  return { filas, advertencias, detalle };
}

export const tareaBcrdPortada: Tarea = {
  nombre: "bcrd-portada",
  fuenteId: "bcrd",
  async ejecutar(ctx) {
    const r = await ctx.obtener(URL_PORTADA_BCRD);
    const lectura = parsearPortadaBcrd(r.texto);
    if (lectura.filas.length === 0) throw new Error(`La portada no trajo ninguna cifra legible: ${lectura.advertencias.join(" · ")}`);
    await ctx.registrar(lectura.filas);
    return {
      parcial: lectura.advertencias.length > 0,
      advertencias: lectura.advertencias,
      detalle: { ...lectura.detalle, leidas: lectura.filas.length },
    };
  },
};

// ---------------------------------------------------------------------------
// Excel: utilidades de encabezados
// ---------------------------------------------------------------------------

function textoCelda(c: CeldaXlsx | undefined): string {
  return c?.tipo === "texto" ? c.texto.replace(/\s+/g, " ").trim() : "";
}

/** Primera fila (de las primeras `hasta`) donde alguna celda cumple `prueba`. */
function buscarFila(hoja: HojaXlsx, prueba: (texto: string) => boolean, hasta = 40): number | null {
  for (const n of hoja.numerosDeFila) {
    if (n > hasta) break;
    for (const c of hoja.fila(n).values()) if (prueba(textoCelda(c))) return n;
  }
  return null;
}

/** Columna (letra) de la fila `n` cuyo texto cumple `prueba`. */
function columnaCon(hoja: HojaXlsx, n: number, prueba: (texto: string) => boolean): string | null {
  for (const c of hoja.fila(n).values()) if (prueba(textoCelda(c))) return c.columna;
  return null;
}

/** Mes de una celda: texto («Ago») o fecha serial con formato de fecha. */
function mesDeCelda(c: CeldaXlsx | undefined, fecha1904: boolean): number | null {
  if (!c) return null;
  // «Feb1», «Mar2»: el número pegado es la llamada a una nota al pie (Serie_TPM.xlsx, feb 2013 y mar 2020).
  if (c.tipo === "texto") return numeroMes(c.texto.replace(/\s*\d+\/?\s*$/, ""));
  if (c.tipo === "numero" && /m/i.test(c.formato)) {
    try {
      return Number(serialAFecha(c.texto, fecha1904).slice(5, 7));
    } catch {
      return null;
    }
  }
  return null;
}

function anioDeCelda(c: CeldaXlsx | undefined): number | null {
  if (!c || c.tipo !== "numero") return null;
  const n = numeroExcel(c.texto);
  return n && /^\d{4}$/.test(n) ? Number(n) : null;
}

// ---------------------------------------------------------------------------
// Excel: dólar de referencia (hoja «Diaria»)
// ---------------------------------------------------------------------------

export function parsearDolarExcel(libro: LibroXlsx, desde: string, url = URL_DOLAR_XLSX): LecturaBcrd {
  const hoja = libro.hoja("Diaria");
  if (!hoja) throw new Error("Formato inesperado: el Excel del dólar no tiene la hoja «Diaria»");
  const enc = buscarFila(hoja, (t) => t === "Compra");
  if (enc === null) throw new Error("Formato inesperado: sin encabezado «Compra» en la hoja «Diaria»");
  const col = {
    anio: columnaCon(hoja, enc, (t) => t === "Año"),
    mes: columnaCon(hoja, enc, (t) => t === "Mes"),
    dia: columnaCon(hoja, enc, (t) => t === "Día"),
    compra: columnaCon(hoja, enc, (t) => t === "Compra"),
    venta: columnaCon(hoja, enc, (t) => t === "Venta"),
  };
  if (!col.anio || !col.mes || !col.dia || !col.compra || !col.venta) {
    throw new Error("Formato inesperado: faltan columnas Año/Mes/Día/Compra/Venta en la hoja «Diaria»");
  }
  const filas: FilaObservacion[] = [];
  const advertencias: string[] = [];
  let ultima: string | null = null;
  for (const n of hoja.numerosDeFila) {
    if (n <= enc) continue;
    const f = hoja.fila(n);
    const anio = anioDeCelda(f.get(col.anio));
    const mes = mesDeCelda(f.get(col.mes), libro.fecha1904);
    const diaTxt = numeroExcel(f.get(col.dia)?.texto);
    if (anio === null || mes === null || !diaTxt || !/^\d{1,2}$/.test(diaTxt)) continue; // notas al pie
    const fecha = fechaIso(anio, mes, Number(diaTxt));
    if (!fecha) {
      advertencias.push(`Fila ${n}: fecha inexistente ${anio}-${mes}-${diaTxt}`);
      continue;
    }
    if (fecha < desde) continue;
    const compra = numeroExcel(f.get(col.compra)?.texto);
    const venta = numeroExcel(f.get(col.venta)?.texto);
    for (const [serie, valor] of [["USDDOP_COMPRA", compra], ["USDDOP_VENTA", venta]] as const) {
      if (valor === null) continue; // día sin dato de ese lado: no se inventa
      if (!enRango(valor, DOLAR_MIN, DOLAR_MAX)) {
        advertencias.push(`${fecha} ${serie}: ${valor} fuera de rango, descartado`);
        continue;
      }
      filas.push({ serie_id: serie, valor, fecha_dato: fecha, url_dato: url });
    }
    if (!ultima || fecha > ultima) ultima = fecha;
  }
  return { filas, advertencias, detalle: { ultima_fecha_dolar: ultima } };
}

// ---------------------------------------------------------------------------
// Excel: tasa de política monetaria (hoja «Tasas»)
// ---------------------------------------------------------------------------

export function parsearTpmExcel(libro: LibroXlsx, url = URL_TPM_XLSX): LecturaBcrd {
  const hoja = libro.hoja("Tasas") ?? libro.hojas[0];
  const enc = buscarFila(hoja, (t) => /^Tasa de Pol[ií]tica Monetaria$/i.test(t));
  if (enc === null) throw new Error("Formato inesperado: sin encabezado «Tasa de Política Monetaria»");
  const colTpm = columnaCon(hoja, enc, (t) => /^Tasa de Pol[ií]tica Monetaria$/i.test(t))!;
  const colAnio = columnaCon(hoja, enc, (t) => t === "Año") ?? "A";
  const colMes = columnaCon(hoja, enc, (t) => t === "Mes") ?? "B";
  const filas: FilaObservacion[] = [];
  const advertencias: string[] = [];
  let anio: number | null = null; // el año solo aparece en la primera fila de cada año
  let ultima: string | null = null;
  for (const n of hoja.numerosDeFila) {
    if (n <= enc) continue;
    const f = hoja.fila(n);
    anio = anioDeCelda(f.get(colAnio)) ?? anio;
    const mes = mesDeCelda(f.get(colMes), libro.fecha1904);
    if (anio === null || mes === null) continue;
    const valor = valorVisible(f.get(colTpm));
    if (valor === null) continue;
    if (!enRango(valor, 0, 100)) {
      advertencias.push(`TPM ${anio}-${mes}: ${valor}% fuera de rango, descartado`);
      continue;
    }
    const fecha = inicioDeMes(anio, mes); // la TPM es la vigente en ese mes
    filas.push({ serie_id: "TPM_BCRD", valor, fecha_dato: fecha, url_dato: url });
    if (!ultima || fecha > ultima) ultima = fecha;
  }
  return { filas, advertencias, detalle: { ultimo_mes_tpm: ultima } };
}

// ---------------------------------------------------------------------------
// Excel: tasas activas y pasivas (cuadros V.4 a V.7)
// ---------------------------------------------------------------------------

/** Una columna del cuadro, identificada por la cadena de encabezados de arriba hacia abajo. */
export interface ColumnaTasa {
  serie: string;
  /** Cada expresión debe coincidir con algún encabezado de la columna, en ese orden. */
  ruta: RegExp[];
}

export interface CuadroTasas {
  archivo: string;
  columnas: ColumnaTasa[];
}

const ACTIVAS = (moneda: "MN" | "ME", interbancaria: boolean): ColumnaTasa[] => [
  { serie: `TASA_ACT_${moneda}_TARJETA`, ruta: [/^Consumo$/i, /^Tarjeta de Cr[eé]dito$/i] },
  { serie: `TASA_ACT_${moneda}_CONSUMO`, ruta: [/^Consumo$/i, /^Otros$/i] },
  { serie: `TASA_ACT_${moneda}_COMERCIAL`, ruta: [/^Comercio$/i] },
  { serie: `TASA_ACT_${moneda}_HIPOTECARIA`, ruta: [/^Actividades Inmobiliarias$/i, /^Vivienda$/i] },
  ...(interbancaria ? [{ serie: `TASA_ACT_${moneda}_INTERBANCARIA`, ruta: [/^Interbancaria/i] }] : []),
];

const PASIVAS = (moneda: "MN" | "ME"): ColumnaTasa[] => [
  { serie: `TASA_PAS_${moneda}_AHORRO`, ruta: [/^Operaciones nuevas$/i, /^Ahorro$/i] },
  { serie: `TASA_PAS_${moneda}_30D`, ruta: [/^Operaciones nuevas$/i, /^Plazo$/i, /^Un mes$/i] },
  { serie: `TASA_PAS_${moneda}_180D`, ruta: [/^Operaciones nuevas$/i, /^Plazo$/i, /^Seis meses$/i] },
  { serie: `TASA_PAS_${moneda}_360D`, ruta: [/^Operaciones nuevas$/i, /^Plazo$/i, /^Un año$/i] },
  { serie: `TASA_PAS_${moneda}_MAS360D`, ruta: [/^Operaciones nuevas$/i, /^Plazo$/i, /^M[aá]s de un año$/i] },
];

export const CUADROS_TASAS: readonly CuadroTasas[] = [
  { archivo: "tasas_activas_mn.xlsx", columnas: ACTIVAS("MN", true) },
  { archivo: "tasas_activas_me.xlsx", columnas: ACTIVAS("ME", false) },
  { archivo: "tasas_pasivas_mn.xlsx", columnas: PASIVAS("MN") },
  { archivo: "tasas_pasivas_me.xlsx", columnas: PASIVAS("ME") },
];

/**
 * Encabezados efectivos de cada columna (de arriba hacia abajo). Una celda combinada solo trae texto
 * en su primera columna; se extiende hacia la derecha mientras la fila de arriba no abra otro grupo.
 */
function encabezadosPorColumna(hoja: HojaXlsx, filas: number[]): Map<string, string[]> {
  const columnas = new Set<string>();
  for (const n of filas) for (const c of hoja.fila(n).keys()) columnas.add(c);
  const orden = [...columnas].sort((a, b) => a.length - b.length || a.localeCompare(b));
  const resultado = new Map<string, string[]>(orden.map((c) => [c, []]));
  const iniciosPadre = new Set<string>(); // columnas donde algún encabezado superior abre un grupo
  for (const n of filas) {
    let vigente = "";
    const iniciosFila = new Set<string>();
    for (const col of orden) {
      const t = textoCelda(hoja.fila(n).get(col));
      if (t) {
        vigente = t;
        iniciosFila.add(col);
      } else if (iniciosPadre.has(col)) {
        vigente = ""; // empieza otro grupo arriba: el texto de la izquierda ya no aplica
      }
      if (vigente) resultado.get(col)!.push(vigente);
    }
    for (const c of iniciosFila) iniciosPadre.add(c);
  }
  return resultado;
}

function rutaCoincide(encabezados: string[], ruta: RegExp[]): boolean {
  let i = 0;
  for (const e of encabezados) if (i < ruta.length && ruta[i].test(e)) i++;
  return i === ruta.length;
}

export function parsearCuadroTasas(libro: LibroXlsx, cuadro: CuadroTasas, desde: string): LecturaBcrd {
  const hoja = libro.hojas[0];
  const url = urlMonetario(cuadro.archivo);
  const inicio = buscarFila(hoja, (t) => /^Año/i.test(t));
  if (inicio === null) throw new Error(`Formato inesperado en ${cuadro.archivo}: sin encabezado «Año»`);
  // Primera fila de datos: un año de 4 cifras en A y un mes en B.
  const primeraDatos = hoja.numerosDeFila.find(
    (n) => n > inicio && anioDeCelda(hoja.fila(n).get("A")) !== null && mesDeCelda(hoja.fila(n).get("B"), libro.fecha1904) !== null,
  );
  if (primeraDatos === undefined) throw new Error(`Formato inesperado en ${cuadro.archivo}: sin filas de datos`);
  const filasEncabezado = hoja.numerosDeFila.filter((n) => n >= inicio && n < primeraDatos);
  const encabezados = encabezadosPorColumna(hoja, filasEncabezado);

  const advertencias: string[] = [];
  const asignadas: { serie: string; columna: string }[] = [];
  for (const col of cuadro.columnas) {
    const candidatas = [...encabezados.entries()].filter(([, e]) => rutaCoincide(e, col.ruta)).map(([c]) => c);
    if (candidatas.length !== 1) {
      advertencias.push(`${cuadro.archivo}: la columna de ${col.serie} ${candidatas.length ? "es ambigua" : "no aparece"}`);
      continue;
    }
    asignadas.push({ serie: col.serie, columna: candidatas[0] });
  }

  const filas: FilaObservacion[] = [];
  let anio: number | null = null;
  let ultima: string | null = null;
  for (const n of hoja.numerosDeFila) {
    if (n < primeraDatos) continue;
    const f = hoja.fila(n);
    anio = anioDeCelda(f.get("A")) ?? anio;
    const mes = mesDeCelda(f.get("B"), libro.fecha1904);
    if (anio === null || mes === null) continue; // notas al pie
    const fecha = finDeMes(anio, mes);
    if (fecha < desde) continue;
    for (const a of asignadas) {
      const valor = valorVisible(f.get(a.columna));
      if (valor === null) continue;
      if (!enRango(valor, 0, 100)) {
        advertencias.push(`${a.serie} ${fecha}: ${valor}% fuera de rango, descartado`);
        continue;
      }
      filas.push({ serie_id: a.serie, valor, fecha_dato: fecha, url_dato: url });
      if (!ultima || fecha > ultima) ultima = fecha;
    }
  }
  return {
    filas,
    advertencias,
    detalle: { [cuadro.archivo]: { ultimo_mes: ultima, columnas: Object.fromEntries(asignadas.map((a) => [a.serie, a.columna])) } },
  };
}

// ---------------------------------------------------------------------------
// Tarea bcrd-excel
// ---------------------------------------------------------------------------

/** Historial que se registra en cada corrida (las corridas repetidas no reescriben nada). */
const MESES_DOLAR = 15;
const MESES_TASAS = 36;

interface Lectura {
  url: string;
  leer: (libro: LibroXlsx, ctx: ContextoTarea) => LecturaBcrd;
}

export function lecturasExcel(): Lectura[] {
  return [
    { url: URL_DOLAR_XLSX, leer: (l, ctx) => parsearDolarExcel(l, mesesAtras(hoyRD(ctx.ahora), MESES_DOLAR)) },
    { url: URL_TPM_XLSX, leer: (l) => parsearTpmExcel(l) },
    ...CUADROS_TASAS.map((c) => ({
      url: urlMonetario(c.archivo),
      leer: (l: LibroXlsx, ctx: ContextoTarea) => parsearCuadroTasas(l, c, mesesAtras(hoyRD(ctx.ahora), MESES_TASAS)),
    })),
  ];
}

/** `obtenerBytes` se inyecta en pruebas; en producción usa el Lector (robots.txt incluido). */
export function crearTareaBcrdExcel(obtenerBytes?: () => ObtenerBytes): Tarea {
  return {
    nombre: "bcrd-excel",
    fuenteId: "bcrd_excel",
    async ejecutar(ctx) {
      const descargar = obtenerBytes ? obtenerBytes() : crearObtenerBytes();
      const advertencias: string[] = [];
      const detalle: Record<string, unknown> = {};
      let leidos = 0;
      let filas = 0;
      const lecturas = lecturasExcel();
      for (const l of lecturas) {
        const archivo = l.url.split("/").at(-1)!;
        try {
          const libro = leerXlsx(await descargar(l.url));
          const lectura = l.leer(libro, ctx);
          await ctx.registrar(lectura.filas);
          advertencias.push(...lectura.advertencias);
          Object.assign(detalle, lectura.detalle);
          filas += lectura.filas.length;
          leidos++;
        } catch (e) {
          advertencias.push(`${archivo}: ${(e as Error).message}`);
        }
      }
      if (leidos === 0) throw new Error(advertencias.join(" · "));
      return {
        parcial: leidos < lecturas.length || advertencias.length > 0,
        advertencias,
        detalle: { ...detalle, archivos: leidos, leidas: filas },
      };
    },
  };
}

export const tareaBcrdExcel: Tarea = crearTareaBcrdExcel();
