import { readFileSync } from "node:fs";
import { join } from "node:path";
import Big from "big.js";
import { describe, expect, it } from "vitest";
import { almacenMemoria } from "../../../../pruebas/apoyo/almacen-memoria.ts";
import { correrTarea, type FilaObservacion } from "../ingesta.ts";
import { esAvisoCombustibles, inicioSemana, parsearAvisoCombustibles, parsearFeedMicm, tareaMicm } from "./micm.ts";

// Descarga real del 15 oct 2026 de https://micm.gob.do/feed/
const FEED = readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "pruebas", "muestras", "micm", "feed.xml"), "utf8");

const precio = (filas: FilaObservacion[], serie: string, semana: string) =>
  filas.find((f) => f.serie_id === serie && f.fecha_dato === semana);

describe("parsearFeedMicm · feed real", () => {
  const r = parsearFeedMicm(FEED);

  it("encuentra los 2 avisos semanales de combustibles entre los 10 ítems", () => {
    expect(r.avisos.map((a) => a.titulo)).toEqual([
      "Gobierno congela gasoil regular, GLP y gasolina regular; reajusta precio del gasoil óptimo y gasolina premium",
      "Gobierno congela combustibles",
    ]);
    expect(r.semanas).toEqual(["2026-10-03", "2026-10-10"]);
    expect(r.advertencias).toEqual([]);
  });

  it("semana del 10 al 16 oct 2026: premium 358.10 (sube 5.00), regular 317.50, óptimo 318.10 (sube 12.00), gasoil regular 270.80, GLP 135.20", () => {
    const s = "2026-10-10";
    expect(precio(r.filas, "COMB_GASOLINA_PREMIUM", s)).toMatchObject({ valor: "358.1", cambio: "5" });
    expect(precio(r.filas, "COMB_GASOLINA_REGULAR", s)).toMatchObject({ valor: "317.5", cambio: "0" });
    expect(precio(r.filas, "COMB_GASOIL_OPTIMO", s)).toMatchObject({ valor: "318.1", cambio: "12" });
    expect(precio(r.filas, "COMB_GASOIL_REGULAR", s)).toMatchObject({ valor: "270.8", cambio: "0" });
    expect(precio(r.filas, "COMB_GLP", s)).toMatchObject({ valor: "135.2", cambio: "0" });
    expect(precio(r.filas, "COMB_GAS_NATURAL", s)).toMatchObject({ valor: "43.97" }); // RD$ por m³
    expect(r.filas.filter((f) => f.fecha_dato === s)).toHaveLength(10);
  });

  it("el cambio que publica el MICM cuadra con los precios de la semana anterior", () => {
    for (const f of r.filas.filter((x) => x.fecha_dato === "2026-10-10")) {
      const previo = precio(r.filas, f.serie_id, "2026-10-03")!;
      expect(new Big(f.valor).minus(previo.valor).eq(f.cambio!)).toBe(true);
    }
  });

  it("las bajas llevan signo y el % se calcula sobre el precio anterior", () => {
    expect(precio(r.filas, "COMB_AVTUR", "2026-10-03")).toMatchObject({ valor: "333.65", cambio: "-3.34", cambio_pct: "-0.991127" });
    expect(precio(r.filas, "COMB_GASOLINA_PREMIUM", "2026-10-10")?.cambio_pct).toBe("1.416029");
  });

  it("cada precio enlaza al aviso oficial", () => {
    expect(precio(r.filas, "COMB_GLP", "2026-10-03")?.url_dato).toBe("https://micm.gob.do/gobierno-congela-combustibles-6/");
    expect(r.avisos[1].hash).toBe("micm:https://micm.gob.do/?p=288865");
  });
});

describe("avisos sin cifras confiables", () => {
  const item = (contenido: string) => ({
    titulo: "Gobierno congela combustibles",
    url: "https://micm.gob.do/x/",
    fecha: "2026-10-16T22:00:00.000Z",
    guid: "x",
    categorias: ["combustibles"],
    contenido,
  });

  it("sin la semana de vigencia no registra precios", () => {
    const r = parsearAvisoCombustibles(item("<ul><li>Gasolina Premium RD$358.10 por galón</li></ul>"));
    expect(r).toEqual({ semana: null, filas: [], advertencias: ["«Gobierno congela combustibles»: no dice la semana de vigencia"] });
  });

  it("un precio sin la forma «RD$x.xx por galón» se omite y se avisa", () => {
    const r = parsearAvisoCombustibles(
      item("Para la semana del 17 al 23 de octubre de 2026: <ul><li>Gasolina Premium a 358 pesos</li><li>GLP RD$135.20 por m3</li></ul>"),
    );
    expect(r.filas).toEqual([]);
    expect(r.advertencias[0]).toMatch(/COMB_GASOLINA_PREMIUM: precio ilegible/);
    expect(r.advertencias[1]).toMatch(/COMB_GLP: valor o unidad inesperados/);
    expect(r.advertencias[2]).toMatch(/sin precio legible de COMB_GASOLINA_PREMIUM/);
  });

  it("reconoce el aviso por título o categoría", () => {
    expect(esAvisoCombustibles({ titulo: "Gobierno congela combustibles", categorias: [] })).toBe(true);
    expect(esAvisoCombustibles({ titulo: "Ruta Mipymes", categorias: ["MICM"] })).toBe(false);
  });
});

describe("inicioSemana", () => {
  it("semana dentro de un mes, entre dos meses y entre dos años", () => {
    expect(inicioSemana("para la semana del 10 al 16 de octubre de 2026")).toBe("2026-10-10");
    expect(inicioSemana("semana del 31 de octubre al 6 de noviembre de 2026")).toBe("2026-10-31");
    expect(inicioSemana("semana del 26 de diciembre al 1 de enero de 2027")).toBe("2026-12-26");
    expect(inicioSemana("sin semana")).toBeNull();
  });
});

describe("tarea micm", () => {
  it("guarda los avisos y 20 precios (2 semanas × 10 productos)", async () => {
    const { almacen, observaciones, tablas } = almacenMemoria();
    const r = await correrTarea(tareaMicm, almacen, {
      obtener: async (url) => ({ url, status: 200, tipo: "application/rss+xml", texto: FEED, intentos: 1 }),
    });
    expect(r.estado).toBe("ok");
    expect(observaciones).toHaveLength(20);
    expect(tablas.instituciones_feed).toHaveLength(2);
    expect(r.detalle).toMatchObject({ avisos: 2, semanas: ["2026-10-03", "2026-10-10"], precios: 20 });
  });
});
