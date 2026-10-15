import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluarRobots, parsearRobots } from "./robots.ts";

const muestra = (n: string) =>
  readFileSync(join(import.meta.dirname, "..", "..", "..", "pruebas", "muestras", "robots", n), "utf8");

describe("robots.txt reales (sonda del 15 oct 2026)", () => {
  it("Tesoro: Allow / → se puede leer el feed XML", () => {
    const r = parsearRobots(muestra("tesoro.txt"));
    expect(
      evaluarRobots(r, "Strategya", "/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve"),
    ).toBe(true);
  });

  it("BCE: RSS permitido, páginas *_content.en.html no, y Crawl-delay de 5 s", () => {
    const r = parsearRobots(muestra("bce.txt"));
    expect(evaluarRobots(r, "Strategya", "/rss/press.html")).toBe(true);
    expect(evaluarRobots(r, "Strategya", "/press/pr/date/2026/html/ecb.pr261015_content.en.html")).toBe(false);
    expect(r.crawlDelay("Strategya")).toBe(5);
  });

  it("SEC: /cgi-bin prohibido (feed Atom de browse-edgar), índices diarios de EDGAR permitidos", () => {
    const r = parsearRobots(muestra("sec.txt"));
    expect(evaluarRobots(r, "Strategya", "/cgi-bin/browse-edgar?action=getcurrent&type=8-K&output=atom")).toBe(false);
    expect(evaluarRobots(r, "Strategya", "/Archives/edgar/daily-index/2026/QTR4/")).toBe(true);
    expect(evaluarRobots(r, "Strategya", "/Archives/edgar/data/320193/")).toBe(true);
  });

  it("MICM: «Disallow:» vacío permite todo", () => {
    expect(evaluarRobots(parsearRobots(muestra("micm.txt")), "Strategya", "/precios-de-combustibles/")).toBe(true);
  });

  it("BCRD: responde una página HTML en lugar de robots.txt → no hay reglas", () => {
    const r = parsearRobots(muestra("bcrd-pagina-404.txt"));
    expect(r.grupos).toEqual([]);
    expect(evaluarRobots(r, "Strategya", "/")).toBe(true);
  });
});

describe("reglas RFC 9309", () => {
  it("gana la regla más larga; Allow gana el empate", () => {
    const r = parsearRobots("User-agent: *\nDisallow: /datos\nAllow: /datos/publicos\nDisallow: /x\nAllow: /x\n");
    expect(evaluarRobots(r, "Strategya", "/datos/privados")).toBe(false);
    expect(evaluarRobots(r, "Strategya", "/datos/publicos/hoy")).toBe(true);
    expect(evaluarRobots(r, "Strategya", "/x")).toBe(true);
  });

  it("comodines * y fin de ruta $", () => {
    const r = parsearRobots("User-agent: *\nDisallow: /*.xlsx$\nDisallow: /tmp*/borrador\n");
    expect(evaluarRobots(r, "Strategya", "/estadisticas/tasas.xlsx")).toBe(false);
    expect(evaluarRobots(r, "Strategya", "/estadisticas/tasas.xlsx?v=2")).toBe(true);
    expect(evaluarRobots(r, "Strategya", "/tmp123/borrador")).toBe(false);
  });

  it("un grupo con nuestro nombre reemplaza al de «*»", () => {
    const r = parsearRobots("User-agent: *\nDisallow: /\n\nUser-agent: strategya\nUser-agent: otro\nDisallow: /privado\n");
    expect(evaluarRobots(r, "Strategya", "/publico")).toBe(true);
    expect(evaluarRobots(r, "Strategya", "/privado")).toBe(false);
    expect(evaluarRobots(r, "Otro", "/publico")).toBe(true);
    expect(evaluarRobots(r, "Desconocido", "/publico")).toBe(false);
  });

  it("Disallow: / bloquea todo salvo el propio robots.txt", () => {
    const r = parsearRobots("User-agent: *\nDisallow: /\n");
    expect(evaluarRobots(r, "Strategya", "/cualquier/cosa")).toBe(false);
    expect(evaluarRobots(r, "Strategya", "/robots.txt")).toBe(true);
  });

  it("ignora comentarios y mayúsculas en las claves", () => {
    const r = parsearRobots("# hola\nUSER-AGENT: * # todos\nDISALLOW: /a # no\n");
    expect(evaluarRobots(r, "Strategya", "/a/b")).toBe(false);
  });
});
