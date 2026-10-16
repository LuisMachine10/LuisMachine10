import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { almacenMemoria } from "../../../../pruebas/apoyo/almacen-memoria.ts";
import type { Respuesta } from "../http.ts";
import { correrTarea } from "../ingesta.ts";
import {
  filasInstitucion,
  FUENTES_INSTITUCIONES,
  parsearCepalHtml,
  parsearRssInstitucion,
  parsearTesoroHtml,
  TAREAS_INSTITUCIONES,
} from "./rss-instituciones.ts";

// Descargas reales del 15 oct 2026 (sonda en GitHub Actions). No se editan a mano.
const leer = (archivo: string) =>
  readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "pruebas", "muestras", "instituciones", archivo), "utf8");

const tarea = (nombre: string) => TAREAS_INSTITUCIONES.find((t) => t.nombre === nombre)!;
const respuesta = (url: string, texto: string): Respuesta => ({ url, status: 200, tipo: "text/xml", texto, intentos: 1 });

describe("RSS de bancos centrales · muestras reales", () => {
  it("BIS: la fecha es solo el día → solo_fecha", () => {
    const r = parsearRssInstitucion(leer("bis-pressrels.rss"));
    expect(r).toHaveLength(10);
    expect(r.every((x) => x.solo_fecha)).toBe(true);
    expect(parsearRssInstitucion(leer("bis-cbspeeches.rss"))).toHaveLength(50);
  });

  it("Fed, BCE, BoJ y BoE traen hora real", () => {
    for (const [archivo, n] of [["fed-press_all.xml", 20], ["bce-press.rss", 15], ["boj-whatsnew.xml", 54], ["boe-news.rss", 50]] as const) {
      const r = parsearRssInstitucion(leer(archivo));
      expect(r, archivo).toHaveLength(n);
      expect(r.some((x) => x.solo_fecha), archivo).toBe(false);
    }
  });

  it("el BCE a medianoche de Fráncfort no se confunde con «solo fecha» (la cruda trae hora y zona)", () => {
    const [primero] = parsearRssInstitucion(leer("bce-press.rss"));
    expect(primero).toMatchObject({ fecha: "2026-10-14T00:00:00.000Z", solo_fecha: false });
  });
});

describe("listas HTML · muestras reales", () => {
  it("Tesoro: 10 comunicados con hora, enlace absoluto y título limpio", () => {
    const r = parsearTesoroHtml(leer("tesoro-press-releases.html"));
    expect(r).toHaveLength(10);
    expect(r[0]).toEqual({
      titulo:
        "Statement from U.S. Secretary of the Treasury Scott Bessent for the World Bank Development Committee and IMF International Monetary and Financial Committee",
      url: "https://home.treasury.gov/news/press-releases/sb0659/",
      fecha: "2026-10-14T16:00:00.000Z",
      solo_fecha: false,
    });
    expect(r.at(-1)?.url).toBe("https://home.treasury.gov/news/press-releases/sb0650/");
  });

  it("CEPAL: 20 comunicados, solo día (12:00 UTC) y meses en español", () => {
    const r = parsearCepalHtml(leer("cepal-comunicados.html"));
    expect(r).toHaveLength(20);
    expect(r.every((x) => x.solo_fecha && x.fecha.endsWith("T12:00:00.000Z"))).toBe(true);
    expect(r[0].fecha).toBe("2026-10-15T12:00:00.000Z");
    expect(r[0].url).toMatch(/^https:\/\/www\.cepal\.org\/es\/comunicados\/cepal-exportaciones-bienes/);
    expect(r.at(-1)?.fecha).toBe("2026-06-11T12:00:00.000Z");
  });

  it("una página sin la lista (aplicación JS del Banco Mundial) no inventa comunicados", () => {
    expect(parsearTesoroHtml(leer("bancomundial-news-all.html"))).toEqual([]);
    expect(parsearCepalHtml(leer("bancomundial-news-all.html"))).toEqual([]);
  });
});

describe("filasInstitucion", () => {
  it("toma los 30 más recientes, sin duplicados por hash", async () => {
    const items = parsearRssInstitucion(leer("boj-whatsnew.xml"));
    const filas = await filasInstitucion("BoJ", "boj_rss", [...items, items[0]]);
    expect(filas).toHaveLength(30);
    expect(new Set(filas.map((f) => f.hash)).size).toBe(30);
    expect(filas[0]).toMatchObject({ institucion: "BoJ", fuente_id: "boj_rss", fecha: "2026-10-15T01:30:00.000Z" });
  });
});

describe("tareas de instituciones", () => {
  it("una tarea por institución; FMI, OCDE, OFAC, Banco Mundial y BID no se consultan", () => {
    expect(TAREAS_INSTITUCIONES.map((t) => t.nombre)).toEqual([
      "instituciones-fed", "instituciones-bce", "instituciones-boj", "instituciones-boe",
      "instituciones-bis", "instituciones-tesoro", "instituciones-cepal",
    ]);
    const urls = FUENTES_INSTITUCIONES.flatMap((f) => f.urls.map((u) => u.url)).join(" ");
    expect(urls).not.toMatch(/imf\.org|oecd\.org|ofac\.treasury\.gov|worldbank\.org|iadb\.org/);
  });

  it("BIS lee comunicados y discursos con etiquetas distintas", async () => {
    const { almacen, tablas } = almacenMemoria();
    const r = await correrTarea(tarea("instituciones-bis"), almacen, {
      obtener: async (url) => respuesta(url, leer(url.endsWith("cbspeeches.rss") ? "bis-cbspeeches.rss" : "bis-pressrels.rss")),
    });
    expect(r.estado).toBe("ok");
    const filas = tablas.instituciones_feed;
    expect(filas.filter((f) => f.institucion === "BIS")).toHaveLength(10);
    expect(filas.filter((f) => f.institucion === "BIS · discursos de banqueros centrales")).toHaveLength(30);
  });

  it("si una de las dos URLs falla, guarda la otra y queda «parcial»", async () => {
    const { almacen, tablas } = almacenMemoria();
    const r = await correrTarea(tarea("instituciones-bis"), almacen, {
      obtener: async (url) => {
        if (url.endsWith("cbspeeches.rss")) throw new Error("HTTP 503");
        return respuesta(url, leer("bis-pressrels.rss"));
      },
    });
    expect(r.estado).toBe("parcial");
    expect(r.error).toMatch(/cbspeeches\.rss: HTTP 503/);
    expect(tablas.instituciones_feed).toHaveLength(10);
  });

  it("un bloqueo (robots o 403) termina en error con el motivo y no guarda nada", async () => {
    const { almacen, tablas } = almacenMemoria();
    const r = await correrTarea(tarea("instituciones-cepal"), almacen, {
      obtener: async () => {
        throw new Error("Lectura no permitida: robots.txt de www.cepal.org no permite /es/comunicados");
      },
    });
    expect(r.estado).toBe("error");
    expect(r.error).toMatch(/no permite/);
    expect(tablas.instituciones_feed).toBeUndefined();
  });

  it("si cambió el formato y no aparece ningún comunicado, lo avisa", async () => {
    const { almacen } = almacenMemoria();
    const r = await correrTarea(tarea("instituciones-tesoro"), almacen, {
      obtener: async (url) => respuesta(url, "<html><body>Rediseño</body></html>"),
    });
    expect(r.estado).toBe("parcial");
    expect(r.error).toMatch(/no se encontró ningún comunicado/);
  });
});
