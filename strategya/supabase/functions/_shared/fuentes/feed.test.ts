import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fechaFeed, hashUrl, limpiarTexto, normalizarUrl, parsearFeed, recortar } from "./feed.ts";

const MUESTRAS = join(import.meta.dirname, "..", "..", "..", "..", "pruebas", "muestras");
const leer = (...p: string[]) => readFileSync(join(MUESTRAS, ...p), "utf8");

describe("parsearFeed · muestras reales de instituciones (15 oct 2026)", () => {
  it("RSS 2.0 de la Fed: 20 entradas con fecha", () => {
    const r = parsearFeed(leer("instituciones", "fed-press_all.xml"));
    expect(r).toHaveLength(20);
    expect(r.every((e) => e.fecha)).toBe(true);
    expect(r[0]).toMatchObject({
      url: "https://www.federalreserve.gov/newsevents/pressreleases/monetary20261013a.htm",
      fecha: "2026-10-13T18:00:00.000Z",
    });
  });

  it("RSS del BCE: quita espacios del título y convierte +0200 a UTC", () => {
    const r = parsearFeed(leer("instituciones", "bce-press.rss"));
    expect(r).toHaveLength(15);
    expect(r[0].titulo).toBe("Frank Elderson: Ensuring resilience in the face of uncertainty");
    expect(r[0].fechaCruda).toBe("Wed, 14 Oct 2026 02:00:00 +0200");
    expect(r[0].fecha).toBe("2026-10-14T00:00:00.000Z");
  });

  it("RSS 1.0 (RDF) del BIS con dc:date de solo día", () => {
    const r = parsearFeed(leer("instituciones", "bis-pressrels.rss"));
    expect(r).toHaveLength(10);
    expect(r[0].fecha).toBe("2026-10-14T00:00:00.000Z");
  });

  it("BoJ y BoE", () => {
    expect(parsearFeed(leer("instituciones", "boj-whatsnew.xml"))).toHaveLength(54);
    expect(parsearFeed(leer("instituciones", "boe-news.rss"))).toHaveLength(50);
  });

  it("un documento HTML no es un feed", () => {
    expect(() => parsearFeed(leer("instituciones", "bancomundial-news-all.html"))).toThrow(/no es un feed/);
  });

  it("Atom con <link rel=alternate href>", () => {
    const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>x</title>
      <entry><title>Uno</title><link rel="self" href="https://a.org/self"/><link rel="alternate" href="https://a.org/uno"/><updated>2026-10-15T10:00:00Z</updated></entry></feed>`;
    expect(parsearFeed(atom)).toEqual([{ titulo: "Uno", url: "https://a.org/uno", fecha: "2026-10-15T10:00:00.000Z", fechaCruda: "2026-10-15T10:00:00Z" }]);
  });
});

describe("texto y fechas", () => {
  it("limpiarTexto decodifica entidades y quita etiquetas", () => {
    expect(limpiarTexto("<b>Sudan&#8217;s</b>  army &amp; &laquo;RSF&raquo;")).toBe("Sudan’s army & «RSF»");
  });
  it("fechaFeed: RFC 822 e ISO; basura → null", () => {
    expect(fechaFeed("Thu, 15 Oct 2026 09:30:00 +0300")).toBe("2026-10-15T06:30:00.000Z");
    expect(fechaFeed("2026-10-15")).toBe("2026-10-15T00:00:00.000Z");
    expect(fechaFeed("ayer")).toBeNull();
    expect(fechaFeed("")).toBeNull();
  });
  it("recortar no corta palabras", () => {
    const t = "palabra ".repeat(60).trim();
    const r = recortar(t, 100);
    expect(r.length).toBeLessThanOrEqual(100);
    expect(r.endsWith("palabra…")).toBe(true);
    expect(recortar("corto")).toBe("corto");
  });
});

describe("normalizarUrl y hashUrl", () => {
  it("misma noticia con rastreo, www, http, fragmento o barra final → misma URL", () => {
    const base = "https://medio.com/a/b?id=7";
    for (const v of [
      "http://www.medio.com/a/b/?id=7&utm_source=rss",
      "https://MEDIO.com/a//b?utm_medium=x&id=7#comentarios",
      "https://medio.com:443/a/b?fbclid=123&id=7",
    ]) {
      expect(normalizarUrl(v)).toBe(base);
    }
  });

  it("parámetros que importan se conservan y se ordenan", () => {
    expect(normalizarUrl("https://x.org/p?b=2&a=1")).toBe("https://x.org/p?a=1&b=2");
  });

  it("hash = SHA-256 hex de la URL normalizada (Web Crypto; igual a node:crypto)", async () => {
    const h = await hashUrl("http://www.medio.com/a/b/?id=7&utm_source=rss");
    expect(h).toBe(createHash("sha256").update("https://medio.com/a/b?id=7").digest("hex"));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
