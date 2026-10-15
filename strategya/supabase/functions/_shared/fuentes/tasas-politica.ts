// Tasas de política monetaria: Reserva Federal (rango objetivo) y BCE (facilidad de depósito).
// La del Banco de Japón no tiene una descarga automática estable: entra por carga manual (serie TASA_BOJ).
//
// Fed · rango objetivo de los fondos federales, series DFEDTARU (techo) y DFEDTARL (piso), que publica la
//   Junta de Gobernadores. Se leen en CSV público desde FRED (Banco de la Reserva Federal de St. Louis):
//     https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFEDTARU&cosd=AAAA-MM-DD
//   El parser también entiende el CSV del Data Download Program de la Fed
//   (https://www.federalreserve.gov/datadownload/), por si se cambia a esa descarga. Lote de sonda:
//   sondas/lotes/22-tasas-politica.txt.
// BCE · facilidad de depósito (FM.D.U2.EUR.4F.KR.DFR.LEV), API pública del Data Portal:
//     https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.DFR.LEV?format=csvdata&lastNObservations=5

import type { FilaObservacion, Tarea } from "../ingesta.ts";
import { aDecimal } from "../json.ts";

export const SERIES_FED = { DFEDTARU: "TASA_FED_SUP", DFEDTARL: "TASA_FED_INF" } as const;
export type IdFred = keyof typeof SERIES_FED;

export function urlFred(id: IdFred, desde: string): string {
  return `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${desde}`;
}
export function urlPaginaFred(id: IdFred): string {
  return `https://fred.stlouisfed.org/series/${id}`;
}

export const URL_BCE =
  "https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.DFR.LEV?format=csvdata&lastNObservations=5";
export const URL_PAGINA_BCE = "https://data.ecb.europa.eu/data/datasets/FM/FM.D.U2.EUR.4F.KR.DFR.LEV";

/** Rango plausible de una tasa de política en %. Fuera de él se descarta y se avisa. */
const MIN_TASA = -5;
const MAX_TASA = 30;
/** Cuántos días hacia atrás se piden y se guardan. */
const DIAS = 30;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** CSV con comillas (RFC 4180). */
export function leerCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let comillas = false;
  const t = texto.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (comillas) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i++;
        } else comillas = false;
      } else campo += ch;
      continue;
    }
    if (ch === '"') comillas = true;
    else if (ch === ",") {
      fila.push(campo);
      campo = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      fila.push(campo);
      if (fila.some((c) => c !== "")) filas.push(fila);
      fila = [];
      campo = "";
    } else campo += ch;
  }
  fila.push(campo);
  if (fila.some((c) => c !== "")) filas.push(fila);
  return filas;
}

export interface LecturaTasa {
  filas: FilaObservacion[];
  advertencias: string[];
}

function filaTasa(serie: string, fecha: string, crudo: string, url: string, adv: string[]): FilaObservacion | null {
  const v = crudo.trim();
  if (v === "" || v === "." || /^NA$|^ND$/i.test(v)) return null; // día sin publicación
  const valor = aDecimal(v);
  if (valor === null) {
    adv.push(`${serie} ${fecha}: valor no numérico «${v}»`);
    return null;
  }
  const n = Number(valor); // solo para el control de rango
  if (n < MIN_TASA || n > MAX_TASA) {
    adv.push(`${serie} ${fecha}: ${valor}% fuera de rango, descartado`);
    return null;
  }
  return { serie_id: serie, valor, fecha_dato: fecha, url_dato: url };
}

/**
 * CSV de FRED («observation_date,DFEDTARU» o «DATE,DFEDTARU») o del Data Download Program de la Fed
 * (encabezados descriptivos y luego «Time Period,…»). Devuelve las últimas `ultimas` observaciones.
 */
export function parsearCsvFed(texto: string, id: IdFred, ultimas = 10): LecturaTasa {
  const serie = SERIES_FED[id];
  const tabla = leerCsv(texto);
  const advertencias: string[] = [];
  let col = -1;
  let inicio = -1;
  for (let i = 0; i < tabla.length && inicio < 0; i++) {
    const cab = tabla[i].map((c) => c.trim());
    const primera = cab[0]?.toLowerCase();
    if (primera === "observation_date" || primera === "date") {
      col = cab.findIndex((c) => c.toUpperCase() === id);
      inicio = i + 1;
    } else if (primera === "time period") {
      // DDP: la columna de la serie se identifica en la fila «Unique Identifier» o en el nombre de la columna.
      col = cab.findIndex((c, j) => j > 0 && c.toUpperCase().includes(id));
      if (col < 0) {
        for (let k = 0; k < i; k++) {
          const j = tabla[k].findIndex((c, x) => x > 0 && c.toUpperCase().includes(id));
          if (j > 0) col = j;
        }
      }
      if (col < 0 && cab.length === 2) col = 1;
      inicio = i + 1;
    }
  }
  if (inicio < 0 || col < 0) throw new Error(`Fed: formato inesperado (no se encontró la columna ${id})`);
  const filas: FilaObservacion[] = [];
  for (const f of tabla.slice(inicio)) {
    const fecha = f[0]?.trim() ?? "";
    if (!FECHA.test(fecha)) continue;
    const fila = filaTasa(serie, fecha, f[col] ?? "", urlPaginaFred(id), advertencias);
    if (fila) filas.push(fila);
  }
  filas.sort((a, b) => a.fecha_dato.localeCompare(b.fecha_dato));
  return { filas: filas.slice(-ultimas), advertencias };
}

/** CSV del Data Portal del BCE (format=csvdata): columnas TIME_PERIOD y OBS_VALUE. */
export function parsearCsvBce(texto: string): LecturaTasa {
  const tabla = leerCsv(texto);
  if (tabla.length === 0) throw new Error("BCE: respuesta vacía");
  const cab = tabla[0].map((c) => c.trim().toUpperCase());
  const iFecha = cab.indexOf("TIME_PERIOD");
  const iValor = cab.indexOf("OBS_VALUE");
  if (iFecha < 0 || iValor < 0) throw new Error("BCE: formato inesperado (faltan TIME_PERIOD u OBS_VALUE)");
  const advertencias: string[] = [];
  const filas: FilaObservacion[] = [];
  for (const f of tabla.slice(1)) {
    const fecha = f[iFecha]?.trim() ?? "";
    if (!FECHA.test(fecha)) {
      advertencias.push(`BCE: fecha inesperada «${fecha}»`);
      continue;
    }
    const fila = filaTasa("TASA_BCE_DEP", fecha, f[iValor] ?? "", URL_PAGINA_BCE, advertencias);
    if (fila) filas.push(fila);
  }
  filas.sort((a, b) => a.fecha_dato.localeCompare(b.fecha_dato));
  return { filas, advertencias };
}

export const tareaTasasPolitica: Tarea = {
  nombre: "tasas-politica",
  fuenteId: "fed_h15",
  async ejecutar(ctx) {
    const desde = new Date(ctx.ahora.getTime() - DIAS * 86_400_000).toISOString().slice(0, 10);
    const advertencias: string[] = [];
    const ultimas: Record<string, string | null> = {};
    let fuentesBien = 0;
    const lecturas: [string, () => Promise<LecturaTasa>][] = [
      ...(Object.keys(SERIES_FED) as IdFred[]).map(
        (id) => [`Fed ${id}`, async () => parsearCsvFed((await ctx.obtener(urlFred(id, desde))).texto, id)] as [string, () => Promise<LecturaTasa>],
      ),
      ["BCE", async () => parsearCsvBce((await ctx.obtener(URL_BCE)).texto)],
    ];
    for (const [nombre, leer] of lecturas) {
      try {
        const l = await leer();
        await ctx.registrar(l.filas);
        advertencias.push(...l.advertencias);
        ultimas[nombre] = l.filas.at(-1)?.fecha_dato ?? null;
        if (l.filas.length === 0) advertencias.push(`${nombre}: sin observaciones en la respuesta`);
        else fuentesBien++;
      } catch (e) {
        advertencias.push(`${nombre}: ${(e as Error).message}`);
      }
    }
    if (fuentesBien === 0) throw new Error(advertencias.join(" · "));
    return { parcial: advertencias.length > 0, advertencias, detalle: { ultimas, boj: "carga manual (TASA_BOJ)" } };
  },
};
