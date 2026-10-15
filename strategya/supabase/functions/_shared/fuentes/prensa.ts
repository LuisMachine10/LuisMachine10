// Prensa por RSS: respaldo de GDELT para guerras y para RD.
// robots.txt se revisa en cada corrida (ctx.obtener). Solo se guarda titular, enlace, medio y fecha:
// NUNCA el texto ni el resumen del artículo.
//
// Feeds confirmados = los que se leen. Los no confirmados (prensa dominicana: no hubo salida a internet
// para verificarlos) quedan listos pero apagados hasta que la sonda (sondas/lotes/22-prensa-rss.txt)
// confirme la URL y el formato; luego basta cambiar `confirmado` a true.

import type { Tarea } from "../ingesta.ts";
import { type ArticuloGdelt, type FilaNoticia, filasNoticias } from "./gdelt.ts";
import { parsearFeed, recortar } from "./feed.ts";

export interface FeedPrensa {
  fuenteId: string;
  medio: string;
  url: string;
  /** Medio dominicano: sus titulares son «rd» salvo que hablen de una guerra. */
  rd: boolean;
  confirmado: boolean;
}

export const FEEDS_PRENSA: readonly FeedPrensa[] = [
  { fuenteId: "aljazeera_rss", medio: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", rd: false, confirmado: true },
  { fuenteId: "france24_rss", medio: "France 24", url: "https://www.france24.com/en/rss", rd: false, confirmado: true },
  { fuenteId: "diariolibre_rss", medio: "Diario Libre", url: "https://www.diariolibre.com/rss/portada.xml", rd: true, confirmado: false },
  { fuenteId: "listin_rss", medio: "Listín Diario", url: "https://listindiario.com/rss/portada.xml", rd: true, confirmado: false },
  { fuenteId: "eldinero_rss", medio: "elDinero", url: "https://eldinero.com.do/feed/", rd: true, confirmado: false },
  { fuenteId: "dominicantoday_rss", medio: "Dominican Today", url: "https://dominicantoday.com/feed/", rd: true, confirmado: false },
];

/** Cuántos titulares por feed y corrida (los más recientes). */
const MAX_POR_FEED = 40;

/** RSS de un medio → artículos (titular, enlace, medio, fecha). Las entradas sin fecha se descartan. */
export function parsearPrensa(xml: string, medio: string): ArticuloGdelt[] {
  return parsearFeed(xml)
    .filter((e): e is typeof e & { fecha: string } => e.fecha !== null)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
    .slice(0, MAX_POR_FEED)
    .map((e) => ({ titular: recortar(e.titulo), url: e.url, medio, fecha: e.fecha, idioma: null }));
}

export function crearTareaPrensa(feeds: readonly FeedPrensa[]): Tarea {
  return {
    nombre: "noticias-prensa",
    fuenteId: "aljazeera_rss",
    async ejecutar(ctx) {
      const advertencias: string[] = [];
      const filas: FilaNoticia[] = [];
      const porMedio: Record<string, number> = {};
      const activos = feeds.filter((f) => f.confirmado);
      const pendientes = feeds.filter((f) => !f.confirmado).map((f) => `${f.medio} (${f.url})`);
      let leidos = 0;
      let descartadas = 0;
      for (const f of activos) {
        try {
          const r = await ctx.obtener(f.url);
          const articulos = parsearPrensa(r.texto, f.medio);
          const res = await filasNoticias(articulos, { fuenteId: f.fuenteId, origen: "rss", medioRD: f.rd });
          filas.push(...res.filas);
          descartadas += res.descartadas;
          porMedio[f.medio] = res.filas.length;
          leidos++;
        } catch (e) {
          advertencias.push(`${f.medio}: ${(e as Error).message}`);
        }
      }
      if (activos.length > 0 && leidos === 0) throw new Error(advertencias.join(" · "));
      const unicas = [...new Map(filas.map((x) => [x.hash, x])).values()];
      const nuevas = await ctx.guardar("noticias", unicas as unknown as Record<string, unknown>[], { conflicto: "hash", ignorarDuplicados: true });
      return {
        parcial: advertencias.length > 0,
        advertencias,
        detalle: { por_medio: porMedio, nuevas, descartadas, sin_confirmar: pendientes },
      };
    },
  };
}

export const tareaPrensa: Tarea = crearTareaPrensa(FEEDS_PRENSA);
