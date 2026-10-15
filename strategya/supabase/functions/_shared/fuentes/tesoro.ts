// Tesoro de EE. UU. · Daily Treasury Par Yield Curve Rates (feed XML oficial).
// Documentación: https://home.treasury.gov/treasury-daily-interest-rate-xml-feed
// Formato confirmado con una descarga real el 15 oct 2026 (pruebas/muestras/tesoro/).

import { XMLParser } from "fast-xml-parser";
import { esDecimal, type FilaObservacion, type Tarea } from "../ingesta.ts";

const BASE = "https://home.treasury.gov/resource-center/data-chart-center/interest-rates";

/** Elemento del XML → serie de Strategya. BC_30YEARDISPLAY repite BC_30YEAR y se ignora. */
export const CAMPOS_TESORO: Readonly<Record<string, string>> = {
  BC_1MONTH: "UST_1M",
  BC_1_5MONTH: "UST_1_5M",
  BC_2MONTH: "UST_2M",
  BC_3MONTH: "UST_3M",
  BC_4MONTH: "UST_4M",
  BC_6MONTH: "UST_6M",
  BC_1YEAR: "UST_1A",
  BC_2YEAR: "UST_2A",
  BC_3YEAR: "UST_3A",
  BC_5YEAR: "UST_5A",
  BC_7YEAR: "UST_7A",
  BC_10YEAR: "UST_10A",
  BC_20YEAR: "UST_20A",
  BC_30YEAR: "UST_30A",
};

/** Rango plausible para un rendimiento en %. Fuera de él, el dato se descarta y se avisa. */
const MIN_PLAUSIBLE = -5;
const MAX_PLAUSIBLE = 30;

export function urlXmlTesoro(mes: string): string {
  return `${BASE}/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month=${mes}`;
}

/** Página legible del mismo mes: el enlace que ve Mena junto a cada cifra. */
export function urlPaginaTesoro(mes: string): string {
  return `${BASE}/TextView?type=daily_treasury_yield_curve&field_tdr_date_value_month=${mes}`;
}

/** Mes en curso y el anterior (AAAAMM), según la fecha de Nueva York. */
export function mesesAConsultar(ahora: Date): [string, string] {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit" })
    .formatToParts(ahora);
  const anio = Number(partes.find((p) => p.type === "year")!.value);
  const mes = Number(partes.find((p) => p.type === "month")!.value);
  const previoAnio = mes === 1 ? anio - 1 : anio;
  const previoMes = mes === 1 ? 12 : mes - 1;
  const fmt = (a: number, m: number) => `${a}${String(m).padStart(2, "0")}`;
  return [fmt(anio, mes), fmt(previoAnio, previoMes)];
}

export interface LecturaTesoro {
  filas: FilaObservacion[];
  fechas: string[];
  advertencias: string[];
}

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false, // los números se quedan como texto: nunca pasan por float
  trimValues: true,
  isArray: (nombre) => nombre === "entry",
});

export function parsearXmlTesoro(xml: string, urlDato: string): LecturaTesoro {
  // deno-lint-ignore no-explicit-any
  const doc = parser.parse(xml) as any;
  if (!doc?.feed || doc.feed.title !== "DailyTreasuryYieldCurveRateData") {
    throw new Error("Formato inesperado: no es el feed DailyTreasuryYieldCurveRateData");
  }
  const entradas: unknown[] = doc.feed.entry ?? [];
  const filas: FilaObservacion[] = [];
  const fechas: string[] = [];
  const advertencias: string[] = [];

  for (const entrada of entradas) {
    // deno-lint-ignore no-explicit-any
    const p = (entrada as any)?.content?.properties;
    const fechaCruda = typeof p?.NEW_DATE === "string" ? p.NEW_DATE : "";
    const fecha = /^(\d{4}-\d{2}-\d{2})T/.exec(fechaCruda)?.[1];
    if (!fecha) {
      advertencias.push(`Entrada sin fecha válida («${fechaCruda}»)`);
      continue;
    }
    fechas.push(fecha);
    for (const [campo, serie] of Object.entries(CAMPOS_TESORO)) {
      const crudo = p[campo];
      if (crudo === undefined || crudo === "") continue; // plazo no publicado ese día
      const valor = String(crudo);
      if (!esDecimal(valor)) {
        advertencias.push(`${fecha} ${campo}: valor no numérico «${valor}»`);
        continue;
      }
      const n = Number(valor); // solo para el control de rango; lo que se guarda es el texto
      if (n < MIN_PLAUSIBLE || n > MAX_PLAUSIBLE) {
        advertencias.push(`${fecha} ${campo}: ${valor}% fuera de rango, descartado`);
        continue;
      }
      filas.push({ serie_id: serie, valor, fecha_dato: fecha, url_dato: urlDato });
    }
  }
  return { filas, fechas: [...new Set(fechas)].sort(), advertencias };
}

export const tareaTesoro: Tarea = {
  nombre: "ingesta-tesoro",
  fuenteId: "tesoro_eeuu",
  async ejecutar(ctx) {
    const meses = mesesAConsultar(ctx.ahora);
    const advertencias: string[] = [];
    const fechas: string[] = [];
    let mesesLeidos = 0;
    let filas = 0;

    for (const mes of meses) {
      try {
        const r = await ctx.obtener(urlXmlTesoro(mes));
        const lectura = parsearXmlTesoro(r.texto, urlPaginaTesoro(mes));
        await ctx.registrar(lectura.filas);
        advertencias.push(...lectura.advertencias);
        fechas.push(...lectura.fechas);
        filas += lectura.filas.length;
        mesesLeidos++;
      } catch (e) {
        advertencias.push(`Mes ${mes}: ${(e as Error).message}`);
      }
    }

    if (mesesLeidos === 0) throw new Error(advertencias.join(" · "));
    const ordenadas = [...new Set(fechas)].sort();
    return {
      parcial: mesesLeidos < meses.length || advertencias.length > 0,
      advertencias,
      detalle: { meses, ultima_fecha: ordenadas.at(-1) ?? null, dias: ordenadas.length, leidas: filas },
    };
  },
};
