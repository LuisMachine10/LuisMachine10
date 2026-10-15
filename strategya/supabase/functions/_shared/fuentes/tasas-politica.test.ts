import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { almacenMemoria } from "../../../../pruebas/apoyo/almacen-memoria.ts";
import { correrTarea } from "../ingesta.ts";
import { leerCsv, parsearCsvBce, parsearCsvFed, tareaTasasPolitica, URL_BCE, urlFred } from "./tasas-politica.ts";

const MUESTRAS = join(import.meta.dirname, "..", "..", "..", "..", "pruebas", "muestras");
// SINTÉTICAS: reemplazar por reales (sondas/lotes/22-tasas-politica.txt).
const FRED = readFileSync(join(MUESTRAS, "fed", "fredgraph-DFEDTARU-SINTETICA.csv"), "utf8");
const BCE = readFileSync(join(MUESTRAS, "bce", "DFR-csvdata-SINTETICA.csv"), "utf8");

describe("leerCsv", () => {
  it("respeta comillas con comas y comillas dobles", () => {
    expect(leerCsv('a,"b, c","d ""e"""\r\n1,2,3\n')).toEqual([["a", "b, c", 'd "e"'], ["1", "2", "3"]]);
  });
});

describe("parsearCsvFed", () => {
  it("FRED: salta los días sin dato («.») y guarda el texto exacto", () => {
    const l = parsearCsvFed(FRED, "DFEDTARU");
    expect(l.advertencias).toEqual([]);
    expect(l.filas).toHaveLength(6);
    expect(l.filas.at(-1)).toEqual({
      serie_id: "TASA_FED_SUP",
      valor: "4.25",
      fecha_dato: "2026-10-14",
      url_dato: "https://fred.stlouisfed.org/series/DFEDTARU",
    });
    expect(l.filas.some((f) => f.fecha_dato === "2026-10-11")).toBe(false);
  });

  it("FRED con encabezado antiguo DATE y el piso", () => {
    const l = parsearCsvFed("DATE,DFEDTARL\n2026-10-14,4.00\n", "DFEDTARL");
    expect(l.filas).toEqual([{ serie_id: "TASA_FED_INF", valor: "4", fecha_dato: "2026-10-14", url_dato: "https://fred.stlouisfed.org/series/DFEDTARL" }]);
  });

  it("Data Download Program de la Fed (encabezados descriptivos)", () => {
    const ddp = [
      '"Series Description","Federal funds target range - upper limit"',
      '"Unit:","Percent:_Per_Year"',
      '"Multiplier:","1"',
      '"Unique Identifier:","H15/H15/RIFSPFF_N.D.DFEDTARU"',
      '"Time Period","RIFSPFF_N.D.DFEDTARU"',
      "2026-10-13,4.25",
      "2026-10-14,ND",
    ].join("\n");
    const l = parsearCsvFed(ddp, "DFEDTARU");
    expect(l.filas.map((f) => [f.fecha_dato, f.valor])).toEqual([["2026-10-13", "4.25"]]);
  });

  it("fuera de rango o formato raro: se descarta y se avisa", () => {
    expect(parsearCsvFed("observation_date,DFEDTARU\n2026-10-14,425\n", "DFEDTARU").advertencias).toHaveLength(1);
    expect(() => parsearCsvFed("<html>mantenimiento</html>", "DFEDTARU")).toThrow(/formato inesperado/);
  });
});

describe("parsearCsvBce", () => {
  it("TIME_PERIOD y OBS_VALUE aunque haya comas dentro de comillas", () => {
    const l = parsearCsvBce(BCE);
    expect(l.advertencias).toEqual([]);
    expect(l.filas.map((f) => [f.fecha_dato, f.valor])).toEqual([
      ["2026-10-08", "2"], ["2026-10-09", "2"], ["2026-10-12", "2"], ["2026-10-13", "2"], ["2026-10-14", "2"],
    ]);
    expect(l.filas[0].serie_id).toBe("TASA_BCE_DEP");
  });
  it("sin columnas esperadas: error", () => {
    expect(() => parsearCsvBce("a,b\n1,2\n")).toThrow(/formato inesperado/);
  });
});

describe("tarea tasas-politica", () => {
  const ahora = () => new Date("2026-10-15T22:20:00Z");

  it("lee Fed (techo y piso) y BCE con robots (ctx.obtener)", async () => {
    const { almacen, observaciones } = almacenMemoria();
    const pedidas: string[] = [];
    const r = await correrTarea(tareaTasasPolitica, almacen, {
      ahora,
      obtener: async (url) => {
        pedidas.push(url);
        const texto = url === URL_BCE ? BCE : url.includes("DFEDTARL") ? "observation_date,DFEDTARL\n2026-10-14,4.00\n" : FRED;
        return { url, status: 200, tipo: "text/csv", texto, intentos: 1 };
      },
    });
    expect(r.estado).toBe("ok");
    expect(pedidas).toEqual([urlFred("DFEDTARU", "2026-09-15"), urlFred("DFEDTARL", "2026-09-15"), URL_BCE]);
    expect(new Set(observaciones.map((o) => o.serie_id))).toEqual(new Set(["TASA_FED_SUP", "TASA_FED_INF", "TASA_BCE_DEP"]));
  });

  it("si el BCE bloquea, guarda la Fed y queda parcial con el motivo", async () => {
    const { almacen } = almacenMemoria();
    const r = await correrTarea(tareaTasasPolitica, almacen, {
      ahora,
      obtener: async (url) => {
        if (url === URL_BCE) throw new Error("Lectura no permitida: robots.txt");
        return { url, status: 200, tipo: "text/csv", texto: FRED.replaceAll("DFEDTARU", url.includes("DFEDTARL") ? "DFEDTARL" : "DFEDTARU"), intentos: 1 };
      },
    });
    expect(r.estado).toBe("parcial");
    expect(r.error).toMatch(/BCE: Lectura no permitida/);
  });

  it("si todo falla, error", async () => {
    const { almacen } = almacenMemoria();
    const r = await correrTarea(tareaTasasPolitica, almacen, { ahora, obtener: async () => { throw new Error("sin red"); } });
    expect(r.estado).toBe("error");
  });
});
