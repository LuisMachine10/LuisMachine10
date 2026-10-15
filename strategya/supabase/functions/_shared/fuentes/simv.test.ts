import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { almacenMemoria } from "../../../../pruebas/apoyo/almacen-memoria.ts";
import { Lector } from "../http.ts";
import { correrTarea } from "../ingesta.ts";
import { esPublicacionOficial, filaFeed, parsearItemsRss, tareaSimv, URL_FEED_SIMV } from "./simv.ts";

const MUESTRAS = join(import.meta.dirname, "..", "..", "..", "..", "pruebas", "muestras", "simv");
// Descarga real del 15 oct 2026, truncada a 20 kB por la sonda (el último ítem queda a medias).
const FEED = readFileSync(join(MUESTRAS, "feed-truncado.xml"), "utf8");
const BLOQUEO = readFileSync(join(MUESTRAS, "resoluciones-403-cloudflare.html"), "utf8");

describe("parsearItemsRss · feed real de la SIMV (truncado)", () => {
  const items = parsearItemsRss(FEED);

  it("lee los 3 ítems completos e ignora el cuarto, cortado", () => {
    expect(items.map((i) => i.titulo)).toEqual([
      "SIMV premia investigaciones que exploran el potencial de la diáspora para fortalecer el mercado de capitales dominicano",
      "SIMV se suma a la Semana Mundial del Inversionista 2026 con una amplia agenda de educación y protección al inversionista",
      "Publicaciones oficiales del mes de septiembre",
    ]);
  });

  it("fecha en UTC, enlace, guid y categorías", () => {
    expect(items[2]).toMatchObject({
      url: "https://simv.gob.do/publicaciones-oficiales-del-mes-de-septiembre/",
      fecha: "2026-10-01T15:07:20.000Z",
      guid: "https://simv.gob.do/?p=27643",
      categorias: ["Publicaciones Oficiales"],
    });
  });

  it("distingue las «Publicaciones oficiales» de las noticias", () => {
    expect(items.map(esPublicacionOficial)).toEqual([false, false, true]);
  });

  it("fila para mercado.instituciones_feed con hash estable", () => {
    expect(filaFeed("SIMV", "simv", items[2])).toEqual({
      institucion: "SIMV",
      titulo: "Publicaciones oficiales del mes de septiembre",
      url: "https://simv.gob.do/publicaciones-oficiales-del-mes-de-septiembre/",
      fecha: "2026-10-01T15:07:20.000Z",
      hash: "simv:https://simv.gob.do/?p=27643",
      fuente_id: "simv",
    });
  });

  it("rechaza lo que no es RSS (p. ej. la página de bloqueo de Cloudflare)", () => {
    expect(() => parsearItemsRss(BLOQUEO)).toThrow(/no es un feed RSS/);
  });
});

describe("respeto al bloqueo de la SIMV", () => {
  const cloudflare = (url: string) =>
    new Response(BLOQUEO, { status: 403, headers: { "content-type": "text/html" } }) as Response & { url: string };

  it("con robots.txt en 403, el lector permite SOLO el feed y no la página de resoluciones", async () => {
    const pedidas: string[] = [];
    const lector = new Lector({
      agente: "prueba",
      reintentos: 0,
      fetch: (async (entrada: string | URL | Request) => {
        const url = String(entrada);
        pedidas.push(url);
        if (url.endsWith("/robots.txt")) return cloudflare(url);
        if (url === URL_FEED_SIMV) return new Response(FEED, { status: 200 });
        return cloudflare(url);
      }) as typeof fetch,
    });
    await expect(lector.obtener("https://simv.gob.do/normativas/resoluciones/")).rejects.toThrow(/Lectura no permitida/);
    const r = await lector.obtener(URL_FEED_SIMV);
    expect(r.status).toBe(200);
    expect(pedidas).toEqual(["https://simv.gob.do/robots.txt", URL_FEED_SIMV]); // la página bloqueada ni se pidió
  });
});

describe("tarea simv", () => {
  it("guarda los ítems en instituciones_feed sin duplicar", async () => {
    const { almacen, tablas } = almacenMemoria();
    const r = await correrTarea(tareaSimv, almacen, {
      obtener: async (url) => ({ url, status: 200, tipo: "application/rss+xml", texto: FEED, intentos: 1 }),
    });
    expect(r).toMatchObject({ estado: "ok", filas: 3 });
    expect(r.detalle).toMatchObject({ items: 3, publicaciones_oficiales: 1, ultimo: "2026-10-05T21:15:18.000Z" });
    expect(tablas.instituciones_feed.map((f) => f.institucion)).toEqual(["SIMV", "SIMV", "SIMV"]);
  });

  it("si el feed también se bloquea, la corrida queda en error con el motivo", async () => {
    const { almacen } = almacenMemoria();
    const r = await correrTarea(tareaSimv, almacen, {
      obtener: async () => {
        throw new Error("HTTP 403 en https://simv.gob.do/feed/");
      },
    });
    expect(r).toMatchObject({ estado: "error", error: "HTTP 403 en https://simv.gob.do/feed/" });
  });
});
