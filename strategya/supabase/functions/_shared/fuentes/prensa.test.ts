import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { almacenMemoria } from "../../../../pruebas/apoyo/almacen-memoria.ts";
import type { Respuesta } from "../http.ts";
import { correrTarea } from "../ingesta.ts";
import { crearTareaPrensa, FEEDS_PRENSA, parsearPrensa, tareaPrensa } from "./prensa.ts";
import { filasNoticias } from "./gdelt.ts";

// SINTÉTICA: reemplazar por real (sondas/lotes/22-prensa-rss.txt).
const RSS = readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "pruebas", "muestras", "prensa", "rss-sintetico.xml"), "utf8");
const ok = (url: string, texto: string): Respuesta => ({ url, status: 200, tipo: "application/rss+xml", texto, intentos: 1 });

describe("parsearPrensa", () => {
  const r = parsearPrensa(RSS, "Medio");

  it("titular, enlace, medio y fecha; descarta la entrada sin fecha", () => {
    expect(r).toHaveLength(4);
    expect(r[0]).toEqual({
      titular: "Ceasefire talks resume as airstrikes hit Gaza",
      url: "https://medio-ejemplo.com/news/2026/10/15/ceasefire-gaza",
      medio: "Medio",
      fecha: "2026-10-15T14:05:00.000Z",
      idioma: null,
    });
  });

  it("nunca guarda la descripción ni el texto del artículo", () => {
    expect(JSON.stringify(r)).not.toMatch(/NUNCA guarda|Otro texto/);
  });
});

describe("feeds de prensa", () => {
  it("activos los confirmados por la sonda del 16 oct 2026; Listín Diario apagado (sin feed)", () => {
    expect(FEEDS_PRENSA.filter((f) => f.confirmado).map((f) => f.medio)).toEqual([
      "Al Jazeera", "France 24", "Diario Libre", "elDinero", "Dominican Today",
      "The Wall Street Journal", "The Wall Street Journal", "CNBC", "CNBC", "Financial Times", "Financial Times",
      "Bloomberg Línea", "elEconomista", "Expansión",
    ]);
    expect(FEEDS_PRENSA.find((f) => f.medio === "Listín Diario")?.confirmado).toBe(false);
  });
});

describe("tarea noticias-prensa", () => {
  // Al Jazeera, France 24 y el apagado de Listín (los dominicanos tienen su propia prueba de categoría «rd»).
  const tareaInternacional = crearTareaPrensa(
    FEEDS_PRENSA.filter((f) => ["aljazeera_rss", "france24_rss", "listin_rss"].includes(f.fuenteId)),
  );

  it("lee solo los feeds confirmados y guarda los titulares que encajan, sin duplicados", async () => {
    const { almacen, tablas } = almacenMemoria();
    const pedidas: string[] = [];
    const r = await correrTarea(tareaInternacional, almacen, {
      obtener: async (url) => {
        pedidas.push(url);
        return ok(url, RSS);
      },
    });
    expect(pedidas).toEqual(["https://www.aljazeera.com/xml/rss/all.xml", "https://www.france24.com/en/rss"]);
    expect(r.estado).toBe("ok");
    // 3 titulares con categoría (el del chef no encaja); el mismo enlace en los dos feeds cuenta una vez.
    expect(tablas.noticias).toHaveLength(3);
    const sudan = tablas.noticias.find((n) => String(n.titular).startsWith("Sudan"));
    expect(sudan).toMatchObject({ categoria: "guerra", lugar: "Darfur", pais: "Sudán", origen: "rss" });
    expect(r.detalle).toMatchObject({ descartadas: 2 });
    expect((r.detalle as { sin_confirmar: string[] }).sin_confirmar).toEqual(["Listín Diario (https://listindiario.com/rss/portada.xml)"]);
  });

  it("un medio dominicano marca «rd» lo que no es guerra", async () => {
    const tarea = crearTareaPrensa([{ fuenteId: "diariolibre_rss", medio: "Diario Libre", url: "https://medio.do/rss", rd: true, confirmado: true }]);
    const { almacen, tablas } = almacenMemoria();
    await correrTarea(tarea, almacen, { obtener: async (url) => ok(url, RSS) });
    const cats = Object.fromEntries(tablas.noticias.map((n) => [n.titular, n.categoria]));
    expect(cats["Celebrity chef opens new restaurant"]).toBe("rd");
    expect(cats["Ceasefire talks resume as airstrikes hit Gaza"]).toBe("guerra");
  });

  it("robots.txt que lo prohíbe en un feed: el otro se guarda y queda «parcial»", async () => {
    const { almacen, tablas } = almacenMemoria();
    const r = await correrTarea(tareaInternacional, almacen, {
      obtener: async (url) => {
        if (url.includes("france24")) throw new Error("Lectura no permitida: robots.txt de www.france24.com no permite /en/rss");
        return ok(url, RSS);
      },
    });
    expect(r.estado).toBe("parcial");
    expect(r.error).toMatch(/France 24: Lectura no permitida/);
    expect(tablas.noticias).toHaveLength(3);
  });

  it("si fallan todos, error", async () => {
    const { almacen } = almacenMemoria();
    const r = await correrTarea(tareaPrensa, almacen, {
      obtener: async () => {
        throw new Error("sin red");
      },
    });
    expect(r.estado).toBe("error");
  });
});

describe("feeds REALES (16 oct 2026)", () => {
  const real = (n: string) => readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "pruebas", "muestras", "prensa", n), "utf8");
  for (const [archivo, medio] of [
    ["aljazeera-real-2026-10-16.xml", "Al Jazeera"],
    ["france24-real-2026-10-16.xml", "France 24"],
    ["eldinero-real-2026-10-16.xml", "elDinero"],
    ["dominicantoday-real-2026-10-16.xml", "Dominican Today"],
    ["wsj-markets-real-2026-10-16.xml", "The Wall Street Journal"],
    ["cnbc-top-real-2026-10-16.xml", "CNBC"],
    ["ft-markets-real-2026-10-16.xml", "Financial Times"],
    ["eleconomista-mercados-real-2026-10-16.xml", "elEconomista"],
    ["expansion-mercados-real-2026-10-16.xml", "Expansión"],
  ] as const) {
    it(`${medio}: titulares con enlace http(s) y fecha`, () => {
      const a = parsearPrensa(real(archivo), medio);
      expect(a.length).toBeGreaterThan(5);
      expect(a.every((x) => /^https?:\/\//.test(x.url) && x.titular.length > 0 && !Number.isNaN(Date.parse(x.fecha)))).toBe(true);
    });
  }
});

describe("prensa financiera internacional", () => {
  it("WSJ, CNBC, FT y medios en español están confirmados y con fuente propia", () => {
    const medios = new Set(FEEDS_PRENSA.filter((f) => f.confirmado).map((f) => f.medio));
    for (const m of ["The Wall Street Journal", "CNBC", "Financial Times", "Bloomberg Línea", "elEconomista", "Expansión"]) {
      expect(medios.has(m)).toBe(true);
    }
    expect(FEEDS_PRENSA.filter((f) => f.fuenteId === "wsj_rss").every((f) => !f.rd)).toBe(true);
  });

  it("los feeds de mercados guardan como «mercado» un titular que no calza en ninguna regla", async () => {
    const real = readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "pruebas", "muestras", "prensa", "ft-markets-real-2026-10-16.xml"), "utf8");
    const a = parsearPrensa(real, "Financial Times");
    const sin = await filasNoticias(a, { fuenteId: "ft_rss", origen: "rss" });
    const con = await filasNoticias(a, { fuenteId: "ft_rss", origen: "rss", pista: "mercado" });
    expect(con.filas.length).toBeGreaterThanOrEqual(sin.filas.length);
    expect(con.descartadas).toBe(0);
  });
});
