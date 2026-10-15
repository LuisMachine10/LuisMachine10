import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { almacenMemoria } from "../../../../pruebas/apoyo/almacen-memoria.ts";
import { correrTarea } from "../ingesta.ts";
import { describirSubasta, parsearSubastas, tareaCreditoPublico, urlSubastas } from "./credito-publico.ts";

// Descarga real del 15 oct 2026 de https://www.creditopublico.gob.do/emisiones/subastas?dlAnio=2026
const HTML = readFileSync(
  join(import.meta.dirname, "..", "..", "..", "..", "pruebas", "muestras", "credito-publico", "subastas-2026.html"),
  "utf8",
);

describe("parsearSubastas · página real de 2026", () => {
  const r = parsearSubastas(HTML);

  it("lee los 8 resultados publicados, del más reciente al más viejo", () => {
    expect(r.subastas.map((s) => s.fecha)).toEqual([
      "2026-09-09", "2026-09-08", "2026-05-27", "2026-05-26", "2026-03-25", "2026-03-24", "2026-03-06", "2026-03-05",
    ]);
    expect(r.advertencias).toEqual([]);
  });

  it("la última subasta: segunda ronda extraordinaria no competitiva del 9 sep 2026, con su PDF oficial", () => {
    expect(r.subastas[0]).toEqual({
      fuente: "CREDITO_PUBLICO",
      numero: "resultados/2026/09Subastas - Resultado de segunda ronda subasta extraordinaria no competitiva 9 de Septiembre",
      emisor: "Ministerio de Hacienda y Economía",
      instrumento: "Segunda ronda subasta extraordinaria no competitiva",
      fecha: "2026-09-09",
      url: "https://www.creditopublico.gob.do/Content/subastas/resultados/2026/09Subastas%20-%20Resultado%20de%20segunda%20ronda%20subasta%20extraordinaria%20no%20competitiva%209%20de%20Septiembre.pdf",
      descripcion:
        "Subastas - Resultado de segunda ronda subasta extraordinaria no competitiva 9 de Septiembre. Publicado el 10/09/2026. Monto y tasa de corte: ver el PDF oficial.",
      origen: "automatica",
    });
  });

  it("decodifica las entidades del enlace («&#250;nico») y no trae monto ni tasa inventados", () => {
    const precioUnico = r.subastas[1];
    expect(precioUnico.instrumento).toBe("Subasta extraordinaria competitiva a precio único");
    expect(precioUnico.url).toContain("precio%20%C3%BAnico%208%20de%20Septiembre.pdf");
    for (const s of r.subastas) {
      expect(s).not.toHaveProperty("monto");
      expect(s).not.toHaveProperty("tasa");
    }
  });

  it("los números son únicos y estables (ruta del PDF)", () => {
    expect(new Set(r.subastas.map((s) => s.numero)).size).toBe(8);
  });

  it("encuentra el Consolidado en Excel (pendiente de sonda para leer montos y tasas)", () => {
    expect(r.consolidado).toBe("https://www.creditopublico.gob.do/Content/subastas/consolidados/2026/02Consolidado.xlsx");
  });

  it("rechaza una página que no es la de Crédito Público", () => {
    expect(() => parsearSubastas("<html>Mantenimiento</html>")).toThrow(/Formato inesperado/);
  });
});

describe("describirSubasta", () => {
  it("separa el instrumento de la fecha", () => {
    expect(describirSubasta("Subastas - Resultado de subasta competitiva a precio único 5 de Marzo")).toEqual({
      instrumento: "Subasta competitiva a precio único",
      dia: 5,
      mes: 3,
    });
    expect(describirSubasta("Subastas - Resultado de subasta extraordinaria no competitiva segunda ronda  25 de Marzo")).toMatchObject({
      instrumento: "Subasta extraordinaria no competitiva segunda ronda",
      dia: 25,
    });
    expect(describirSubasta("Resultado sin fecha")).toEqual({ instrumento: "Resultado sin fecha", dia: null, mes: null });
  });
});

describe("tarea credito-publico", () => {
  it("pide el año en curso (hora RD) y guarda en emisiones_rd por (fuente, numero)", async () => {
    const { almacen, tablas } = almacenMemoria();
    const pedidas: string[] = [];
    const r = await correrTarea(tareaCreditoPublico, almacen, {
      ahora: () => new Date("2027-01-01T03:00:00Z"), // 31 dic 2026, 11 PM en RD
      obtener: async (url) => {
        pedidas.push(url);
        return { url, status: 200, tipo: "text/html", texto: HTML, intentos: 1 };
      },
    });
    expect(pedidas).toEqual([urlSubastas(2026)]);
    expect(r).toMatchObject({ estado: "ok", filas: 8 });
    expect(r.detalle).toMatchObject({ subastas: 8, ultima_subasta: "2026-09-09" });
    expect(tablas.emisiones_rd).toHaveLength(8);
  });
});
