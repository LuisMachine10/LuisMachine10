// BCE · tipos de cambio de referencia del euro (uno por día hábil, hacia las 16:00 CET).
//   https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml
//   <Cube time='2026-10-16'><Cube currency='USD' rate='1.1253'/><Cube currency='JPY' rate='177.82'/>…
// Respaldo de FMP para EUR/USD y USD/JPY (solo si falta FMP_API_KEY). EUR/USD es la tasa publicada;
// USD/JPY es el cruce JPY÷USD de esas mismas tasas, con big.js, a 4 decimales (rotulado en la fuente).
// El proveedor «ecb» de OpenBB lee el mismo archivo.

import Big from "big.js";
import type { FilaObservacion, Tarea } from "../ingesta.ts";
import { aDecimal } from "../json.ts";
import { instanteLocal } from "../mercados.ts";

export const URL_FX_BCE = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
export const URL_PAGINA_FX_BCE =
  "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html";

export interface TasasBce {
  fecha: string;
  /** Unidades de cada moneda por 1 €. */
  tasas: Record<string, string>;
}

export function parsearFxBce(xml: string): TasasBce {
  const f = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>/.exec(xml);
  if (!f) throw new Error("BCE: formato inesperado (falta Cube time)");
  const tasas: Record<string, string> = {};
  for (const m of xml.matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([^'"]+)['"]\s*\/>/g)) {
    const v = aDecimal(m[2]);
    if (v && v !== "0") tasas[m[1]] = v;
  }
  if (!tasas.USD) throw new Error("BCE: no vino la tasa del dólar");
  return { fecha: f[1], tasas };
}

/** Hora de referencia de la publicación: 14:15 de Fráncfort (concertación diaria del BCE). */
export function horaReferenciaBce(fecha: string): Date {
  return instanteLocal(fecha, 14 * 60 + 15, "Europe/Berlin");
}

export function filasFxBce(t: TasasBce): FilaObservacion[] {
  const hora = horaReferenciaBce(t.fecha).toISOString();
  const base = { fecha_dato: t.fecha, hora_dato: hora, url_dato: URL_PAGINA_FX_BCE, fuente_id: "bce_fx" };
  const filas: FilaObservacion[] = [{ serie_id: "EURUSD", valor: t.tasas.USD, ...base }];
  if (t.tasas.JPY) {
    const cruce = new Big(t.tasas.JPY).div(t.tasas.USD).round(4, Big.roundHalfUp).toFixed();
    filas.push({ serie_id: "USDJPY", valor: cruce, ...base });
  }
  return filas;
}

export const tareaDivisasBce: Tarea = {
  nombre: "divisas-bce",
  fuenteId: "bce_fx",
  async ejecutar(ctx) {
    if (ctx.entorno("FMP_API_KEY")) return { detalle: { omitida: "FMP tiene clave: EUR/USD y USD/JPY vienen de FMP" } };
    const r = await ctx.obtener(URL_FX_BCE);
    const t = parsearFxBce(r.texto);
    const filas = filasFxBce(t);
    await ctx.registrar(filas);
    return {
      parcial: filas.length < 2,
      advertencias: filas.length < 2 ? ["No vino la tasa del yen: USD/JPY sin actualizar"] : [],
      detalle: { fecha: t.fecha, series: filas.map((f) => `${f.serie_id}=${f.valor}`) },
    };
  },
};
