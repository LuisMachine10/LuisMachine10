// Dirección General de Crédito Público (Ministerio de Hacienda y Economía) · subastas de títulos.
//
// La página https://www.creditopublico.gob.do/emisiones/subastas?dlAnio=AAAA lista, por año, los
// resultados de cada subasta como PDF (título con la fecha de la subasta y fecha de publicación) y un
// «Consolidado» en Excel. Confirmado con la descarga real del 15 oct 2026
// (pruebas/muestras/credito-publico/subastas-2026.html): la página NO trae monto ni tasa de corte en
// HTML; esas cifras viven en los PDF. Aquí se guarda cada subasta con su fecha y enlace al PDF oficial,
// sin monto ni tasa (no se inventan). El Consolidado .xlsx queda pendiente de sonda (sondas/lotes/21-…).

import type { Tarea } from "../ingesta.ts";
import { decodificarEntidades, fechaDdMmAaaa, fechaIso, numeroMes, textoPlano } from "./rd-comun.ts";

export const BASE_CREDITO_PUBLICO = "https://www.creditopublico.gob.do";
export const urlSubastas = (anio: number) => `${BASE_CREDITO_PUBLICO}/emisiones/subastas?dlAnio=${anio}`;

export interface SubastaCp {
  fuente: "CREDITO_PUBLICO";
  numero: string;
  emisor: string;
  instrumento: string;
  fecha: string;
  url: string;
  descripcion: string;
  origen: "automatica";
}

export interface LecturaSubastas {
  subastas: SubastaCp[];
  consolidado: string | null;
  advertencias: string[];
}

/** "Subastas - Resultado de segunda ronda subasta extraordinaria no competitiva 9 de Septiembre" → partes. */
export function describirSubasta(titulo: string): { instrumento: string; dia: number | null; mes: number | null } {
  const limpio = titulo.replace(/\s+/g, " ").trim();
  const fecha = /(\d{1,2}) de ([A-Za-zÁÉÍÓÚáéíóú]+)\s*$/.exec(limpio);
  const sinFecha = fecha ? limpio.slice(0, fecha.index).trim() : limpio;
  const cuerpo = sinFecha.replace(/^Subastas?\s*-\s*/i, "").replace(/^Resultados? de\s+/i, "").trim();
  const instrumento = cuerpo ? cuerpo[0].toUpperCase() + cuerpo.slice(1) : limpio;
  return {
    instrumento,
    dia: fecha ? Number(fecha[1]) : null,
    mes: fecha ? numeroMes(fecha[2]) : null,
  };
}

/** Codifica la ruta del PDF (trae espacios y tildes) sin tocar las barras. */
function urlAbsoluta(ruta: string): string {
  return BASE_CREDITO_PUBLICO + ruta.split("/").map((p) => encodeURIComponent(p)).join("/");
}

export function parsearSubastas(html: string): LecturaSubastas {
  if (!/Cr[eé]dito P[uú]blico/i.test(html)) throw new Error("Formato inesperado: no parece la página de Crédito Público");
  const advertencias: string[] = [];
  const subastas: SubastaCp[] = [];
  const vistos = new Set<string>();

  const enlace = /<a href="(\/Content\/subastas\/resultados\/(\d{4})\/[^"]+?\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(enlace)) {
    const ruta = decodificarEntidades(m[1]);
    const anio = Number(m[2]);
    const cuerpo = m[3];
    const titulo = textoPlano(/<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(cuerpo)?.[1] ?? "");
    const pie = textoPlano(/<p[^>]*>([\s\S]*?)<\/p>/i.exec(cuerpo)?.[1] ?? ""); // "10/09/2026 | 189 KB"
    const publicado = fechaDdMmAaaa(pie);
    const publicadoTexto = /\d{1,2}\/\d{1,2}\/\d{4}/.exec(pie)?.[0];
    if (!titulo) {
      advertencias.push(`Resultado sin título: ${ruta}`);
      continue;
    }
    const d = describirSubasta(titulo);
    const fechaSubasta = d.dia && d.mes ? fechaIso(anio, d.mes, d.dia) : null;
    const fecha = fechaSubasta ?? publicado;
    if (!fecha) {
      advertencias.push(`Sin fecha legible: «${titulo}»`);
      continue;
    }
    // Número estable: la ruta del PDF oficial (año + nombre del archivo), sin la extensión.
    const numero = ruta.replace(/^\/Content\/subastas\//, "").replace(/\.pdf$/i, "");
    if (vistos.has(numero)) continue;
    vistos.add(numero);
    subastas.push({
      fuente: "CREDITO_PUBLICO",
      numero,
      emisor: "Ministerio de Hacienda y Economía",
      instrumento: d.instrumento,
      fecha,
      url: urlAbsoluta(ruta),
      descripcion: `${titulo}.${publicadoTexto ? ` Publicado el ${publicadoTexto}.` : ""} Monto y tasa de corte: ver el PDF oficial.`,
      origen: "automatica",
    });
  }
  const consolidado = /<a href="(\/Content\/subastas\/consolidados\/[^"]+?\.xlsx)"/i.exec(html)?.[1];
  return {
    subastas,
    consolidado: consolidado ? urlAbsoluta(decodificarEntidades(consolidado)) : null,
    advertencias,
  };
}

export const tareaCreditoPublico: Tarea = {
  nombre: "credito-publico",
  fuenteId: "credito_publico",
  async ejecutar(ctx) {
    const anio = Number(new Date(ctx.ahora.getTime() - 4 * 3_600_000).toISOString().slice(0, 4));
    const r = await ctx.obtener(urlSubastas(anio));
    const lectura = parsearSubastas(r.texto);
    // Upsert por (fuente, numero). Monto, moneda y tasa no se envían: así no se borra nada cargado a mano.
    await ctx.guardar("emisiones_rd", lectura.subastas as unknown as Record<string, unknown>[], { conflicto: "fuente,numero" });
    const ultima = lectura.subastas.map((s) => s.fecha).sort().at(-1) ?? null;
    return {
      parcial: lectura.advertencias.length > 0,
      advertencias: lectura.advertencias,
      detalle: { anio, subastas: lectura.subastas.length, ultima_subasta: ultima, consolidado: lectura.consolidado },
    };
  },
};
