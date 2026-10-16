// MICM · Ministerio de Industria, Comercio y Mipymes · precios semanales de combustibles.
//
// El aviso semanal sale los viernes en el feed RSS (https://micm.gob.do/feed/). Confirmado con la
// descarga real del 15 oct 2026 (pruebas/muestras/micm/feed.xml): el content:encoded trae la semana
// («Para la semana del 10 al 16 de octubre de 2026…») y una lista <li> por producto con su precio
// («Gasolina Premium se venderá a RD$358.10 por galón sube RD$5.00.»). Se registran solo los
// precios que se leen con esa forma exacta; si un aviso no trae cifras confiables se guarda el aviso
// (título, fecha y enlace) y los precios quedan para la carga manual.

import Big from "big.js";
import type { FilaObservacion, Tarea } from "../ingesta.ts";
import { enRango, fechaIso, numeroMes, numeroPagina, textoPlano } from "./rd-comun.ts";
import { filaFeed, type FilaFeed, type ItemRss, parsearItemsRss } from "./simv.ts";

export const URL_FEED_MICM = "https://micm.gob.do/feed/";

interface Producto {
  serie: string;
  patron: RegExp;
  unidad: "galon" | "m3";
}

export const PRODUCTOS_MICM: readonly Producto[] = [
  { serie: "COMB_GASOLINA_PREMIUM", patron: /^gasolina premium\b/i, unidad: "galon" },
  { serie: "COMB_GASOLINA_REGULAR", patron: /^gasolina regular\b/i, unidad: "galon" },
  { serie: "COMB_GASOIL_OPTIMO", patron: /^gasoil [óo]ptimo\b/i, unidad: "galon" },
  { serie: "COMB_GASOIL_REGULAR", patron: /^gasoil regular\b/i, unidad: "galon" },
  { serie: "COMB_GLP", patron: /^(gas licuado de petr[óo]leo|glp)\b/i, unidad: "galon" },
  { serie: "COMB_AVTUR", patron: /^avtur\b/i, unidad: "galon" },
  { serie: "COMB_KEROSENE", patron: /^kerosene\b/i, unidad: "galon" },
  { serie: "COMB_FUEL_OIL_6", patron: /^fuel o[íi]l #\s?6\b/i, unidad: "galon" },
  { serie: "COMB_FUEL_OIL_1S", patron: /^fuel o[íi]l 1\s?%\s?s\b/i, unidad: "galon" },
  { serie: "COMB_GAS_NATURAL", patron: /^gas natural\b/i, unidad: "m3" },
];

/** Las cinco que el panel exige para dar el aviso por completo. */
export const PRINCIPALES = ["COMB_GASOLINA_PREMIUM", "COMB_GASOLINA_REGULAR", "COMB_GASOIL_OPTIMO", "COMB_GASOIL_REGULAR", "COMB_GLP"];

/** ¿El ítem es el aviso semanal de combustibles? */
export function esAvisoCombustibles(item: Pick<ItemRss, "titulo" | "categorias">): boolean {
  return /combustible|gasolina|gasoil|GLP/i.test(item.titulo) || item.categorias.some((c) => /^combustibles?$/i.test(c));
}

/** «semana del 10 al 16 de octubre de 2026» / «del 31 de octubre al 6 de noviembre de 2026» → inicio. */
export function inicioSemana(texto: string): string | null {
  const m = /semana del (\d{1,2})(?: de ([a-záéíóú]+))? al (\d{1,2}) de ([a-záéíóú]+) de(?:l)? (\d{4})/i.exec(texto);
  if (!m) return null;
  const anioFin = Number(m[5]);
  const mesFin = numeroMes(m[4]);
  const mesInicio = m[2] ? numeroMes(m[2]) : mesFin;
  if (!mesFin || !mesInicio) return null;
  const anioInicio = mesInicio > mesFin ? anioFin - 1 : anioFin; // semana que cruza el año
  return fechaIso(anioInicio, mesInicio, Number(m[1]));
}

export interface LecturaAviso {
  semana: string | null;
  filas: FilaObservacion[];
  advertencias: string[];
}

export function parsearAvisoCombustibles(item: ItemRss): LecturaAviso {
  const advertencias: string[] = [];
  const plano = textoPlano(item.contenido);
  const semana = inicioSemana(plano);
  if (!semana) return { semana: null, filas: [], advertencias: [`«${item.titulo}»: no dice la semana de vigencia`] };

  const filas: FilaObservacion[] = [];
  const vistas = new Set<string>();
  for (const li of item.contenido.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const linea = textoPlano(li[1]);
    const producto = PRODUCTOS_MICM.find((p) => p.patron.test(linea));
    if (!producto) continue;
    const precio = /RD\$\s*([\d,]+\.\d{2})\s*por\s*(gal[oó]n|m3|m³)/i.exec(linea);
    if (!precio) {
      advertencias.push(`${producto.serie}: precio ilegible en «${linea}»`);
      continue;
    }
    const unidad = /^gal/i.test(precio[2]) ? "galon" : "m3";
    const valor = numeroPagina(precio[1]);
    if (!valor || unidad !== producto.unidad || !enRango(valor, 1, 5000)) {
      advertencias.push(`${producto.serie}: valor o unidad inesperados en «${linea}»`);
      continue;
    }
    if (vistas.has(producto.serie)) {
      advertencias.push(`${producto.serie}: aparece dos veces en el aviso; se toma la primera`);
      continue;
    }
    vistas.add(producto.serie);
    const fila: FilaObservacion = { serie_id: producto.serie, valor, fecha_dato: semana, url_dato: item.url };
    // El aviso publica el cambio («sube RD$5.00», «baja RD$3.34», «mantiene su precio»).
    const cambio = /\b(sube|baja)\s*RD\$\s*([\d,]+\.\d{2})/i.exec(linea);
    const delta = cambio ? numeroPagina(cambio[2]) : /mantiene su precio/i.test(linea) ? "0" : null;
    if (delta !== null) {
      const c = cambio && /baja/i.test(cambio[1]) ? new Big(delta).times(-1) : new Big(delta);
      const anterior = new Big(valor).minus(c);
      fila.cambio = c.toFixed();
      if (anterior.gt(0)) fila.cambio_pct = c.div(anterior).times(100).round(6, Big.roundHalfUp).toFixed();
    }
    filas.push(fila);
  }
  const faltan = PRINCIPALES.filter((s) => !vistas.has(s));
  if (faltan.length) advertencias.push(`Semana ${semana}: sin precio legible de ${faltan.join(", ")}`);
  return { semana, filas, advertencias };
}

export interface LecturaMicm {
  avisos: FilaFeed[];
  filas: FilaObservacion[];
  semanas: string[];
  advertencias: string[];
}

export function parsearFeedMicm(xml: string): LecturaMicm {
  const avisos: FilaFeed[] = [];
  const filas: FilaObservacion[] = [];
  const semanas: string[] = [];
  const advertencias: string[] = [];
  const semanasVistas = new Set<string>();
  // El feed viene del más nuevo al más viejo; si una semana se repite gana el aviso más reciente.
  for (const item of parsearItemsRss(xml)) {
    if (!esAvisoCombustibles(item)) continue;
    avisos.push(filaFeed("MICM", "micm", item));
    const aviso = parsearAvisoCombustibles(item);
    advertencias.push(...aviso.advertencias);
    if (!aviso.semana || semanasVistas.has(aviso.semana)) continue;
    semanasVistas.add(aviso.semana);
    semanas.push(aviso.semana);
    filas.push(...aviso.filas);
  }
  return { avisos, filas, semanas: semanas.sort(), advertencias };
}

export const tareaMicm: Tarea = {
  nombre: "micm",
  fuenteId: "micm",
  async ejecutar(ctx) {
    const r = await ctx.obtener(URL_FEED_MICM);
    const lectura = parsearFeedMicm(r.texto);
    await ctx.guardar("instituciones_feed", lectura.avisos as unknown as Record<string, unknown>[], {
      conflicto: "hash",
      ignorarDuplicados: true,
    });
    await ctx.registrar(lectura.filas);
    return {
      parcial: lectura.advertencias.length > 0,
      advertencias: lectura.avisos.length === 0 ? ["El feed no trae avisos de combustibles esta vez"] : lectura.advertencias,
      detalle: { avisos: lectura.avisos.length, semanas: lectura.semanas, precios: lectura.filas.length },
    };
  },
};
