// Prensa por RSS: respaldo de GDELT para guerras y para RD.
// robots.txt se revisa en cada corrida (ctx.obtener). Solo se guarda titular, enlace, medio y fecha:
// NUNCA el texto ni el resumen del artículo.
//
// Feeds confirmados = los que se leen. Los no confirmados (prensa dominicana: no hubo salida a internet
// para verificarlos) quedan listos pero apagados hasta que la sonda (sondas/lotes/22-prensa-rss.txt)
// confirme la URL y el formato; luego basta cambiar `confirmado` a true.

import type { Tarea } from "../ingesta.ts";
import type { Categoria } from "../geo.ts";
import { type ArticuloGdelt, type FilaNoticia, filasNoticias } from "./gdelt.ts";
import { parsearFeed, recortar } from "./feed.ts";

export interface FeedPrensa {
  fuenteId: string;
  medio: string;
  url: string;
  /** Medio dominicano: sus titulares son «rd» salvo que hablen de una guerra. */
  rd: boolean;
  confirmado: boolean;
  /** Categoría por defecto de un titular que no calza en ninguna regla (feeds de mercados → «mercado»). */
  pista?: Categoria;
}

export const FEEDS_PRENSA: readonly FeedPrensa[] = [
  { fuenteId: "aljazeera_rss", medio: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", rd: false, confirmado: true },
  { fuenteId: "france24_rss", medio: "France 24", url: "https://www.france24.com/en/rss", rd: false, confirmado: true },
  { fuenteId: "diariolibre_rss", medio: "Diario Libre", url: "https://www.diariolibre.com/rss/portada.xml", rd: true, confirmado: true },
  // Listín Diario: /rss/portada.xml y /rss responden 404 (sonda del 16 oct 2026); sin feed conocido.
  { fuenteId: "listin_rss", medio: "Listín Diario", url: "https://listindiario.com/rss/portada.xml", rd: true, confirmado: false },
  { fuenteId: "eldinero_rss", medio: "elDinero", url: "https://eldinero.com.do/feed/", rd: true, confirmado: true },
  { fuenteId: "dominicantoday_rss", medio: "Dominican Today", url: "https://dominicantoday.com/feed/", rd: true, confirmado: true },
  // Prensa financiera internacional (sonda del 16 oct 2026). Solo titulares: WSJ y FT tienen muro de pago
  // y el artículo no se lee; el enlace lleva al sitio del medio.
  { fuenteId: "wsj_rss", medio: "The Wall Street Journal", url: "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain", rd: false, confirmado: true, pista: "mercado" },
  { fuenteId: "wsj_rss", medio: "The Wall Street Journal", url: "https://feeds.content.dowjones.io/public/rss/RSSWorldNews", rd: false, confirmado: true },
  { fuenteId: "cnbc_rss", medio: "CNBC", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", rd: false, confirmado: true },
  { fuenteId: "cnbc_rss", medio: "CNBC", url: "https://www.cnbc.com/id/15839069/device/rss/rss.html", rd: false, confirmado: true, pista: "mercado" },
  { fuenteId: "ft_rss", medio: "Financial Times", url: "https://www.ft.com/markets?format=rss", rd: false, confirmado: true, pista: "mercado" },
  { fuenteId: "ft_rss", medio: "Financial Times", url: "https://www.ft.com/world?format=rss", rd: false, confirmado: true },
  { fuenteId: "bloomberglinea_rss", medio: "Bloomberg Línea", url: "https://www.bloomberglinea.com/arc/outboundfeeds/rss/?outputType=xml", rd: false, confirmado: true },
  { fuenteId: "eleconomista_rss", medio: "elEconomista", url: "https://www.eleconomista.es/rss/rss-mercados.php", rd: false, confirmado: true, pista: "mercado" },
  { fuenteId: "expansion_rss", medio: "Expansión", url: "https://e00-expansion.uecdn.es/rss/mercados.xml", rd: false, confirmado: true, pista: "mercado" },
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
          const res = await filasNoticias(articulos, { fuenteId: f.fuenteId, origen: "rss", medioRD: f.rd, pista: f.pista });
          filas.push(...res.filas);
          descartadas += res.descartadas;
          porMedio[f.medio] = (porMedio[f.medio] ?? 0) + res.filas.length;
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
