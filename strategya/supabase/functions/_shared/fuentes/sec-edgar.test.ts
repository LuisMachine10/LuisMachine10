import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { almacenMemoria } from "../../../../pruebas/apoyo/almacen-memoria.ts";
import { ErrorIngesta, type Respuesta } from "../http.ts";
import { correrTarea } from "../ingesta.ts";
import { diasIndiceSec, FORMULARIOS_SEC, parsearIndiceSec, tareaSec, urlIndiceSec, urlPresentacion } from "./sec-edgar.ts";

// Índice diario real del 14 oct 2026, truncado a ~250 KB por la sonda (llega hasta los 424B2: el
// archivo va ordenado por formulario). No se edita a mano.
const REAL = readFileSync(
  join(import.meta.dirname, "..", "..", "..", "..", "pruebas", "muestras", "sec", "form.20261014.idx.truncado"),
  "utf8",
);

// Líneas DERIVADAS de la muestra real: la primera fila real de 424B2 (BANK OF AMERICA CORP /DE/) con el tipo de
// formulario, el CIK y la ruta cambiados, para probar el filtro con las columnas de ancho fijo exactas del archivo.
const filaReal = REAL.split("\n").find((l) => l.startsWith("424B2 "))!;
const conForm = (form: string, cik: string, acc: string) =>
  form.padEnd(17) + filaReal.slice(17, 79) + cik.padEnd(12) + filaReal.slice(91, 103) + `edgar/data/${cik}/${acc}.txt`;
const encabezado = REAL.split("\n").slice(0, REAL.split("\n").findIndex((l) => /^-{20,}/.test(l)) + 1).join("\n");

describe("parsearIndiceSec · muestra real", () => {
  const r = parsearIndiceSec(REAL, "2026-10-14");

  it("lee todas las filas completas e ignora la última línea cortada", () => {
    expect(r.filas).toBe(1281);
    expect(r.advertencias).toEqual([]);
  });

  it("en el tramo truncado no hay formularios de IPO ni de fusiones: no inventa ninguno", () => {
    expect(r.operaciones).toEqual([]);
  });

  it("rechaza un documento que no es un form.idx", () => {
    expect(() => parsearIndiceSec("<html>Not Found</html>", "2026-10-14")).toThrow(/Formato inesperado/);
  });
});

describe("parsearIndiceSec · filtro de formularios (filas derivadas de la real)", () => {
  const texto = [
    encabezado,
    conForm("S-1", "2000001", "0002000001-26-000001"),
    conForm("424B4", "2000002", "0002000002-26-000002"),
    conForm("425", "2000003", "0002000003-26-000003"),
    conForm("SC TO-T", "2000004", "0002000004-26-000004"),
    conForm("SC 14D9", "2000005", "0002000005-26-000005"),
    conForm("DEFM14A", "2000006", "0002000006-26-000006"),
    conForm("PREM14A", "2000007", "0002000007-26-000007"),
    conForm("F-1", "2000008", "0002000008-26-000008"),
    conForm("S-1/A", "2000009", "0002000009-26-000009"),
    conForm("10-Q", "2000010", "0002000010-26-000010"),
  ].join("\n");
  const r = parsearIndiceSec(texto, "2026-10-14");

  it("solo los 8 formularios de IPO y fusiones (las enmiendas /A y el resto no entran)", () => {
    expect(r.filas).toBe(10);
    expect(r.operaciones.map((o) => o.form)).toEqual(["S-1", "424B4", "425", "SC TO-T", "SC 14D9", "DEFM14A", "PREM14A", "F-1"]);
    expect(new Set(r.operaciones.map((o) => o.form))).toEqual(new Set(Object.keys(FORMULARIOS_SEC)));
  });

  it("tipo, empresa, CIK, fecha y enlace a la página índice de la presentación", () => {
    expect(r.operaciones[0]).toEqual({
      form: "S-1",
      tipo: "ipo",
      empresa: "BANK OF AMERICA CORP /DE/",
      cik: "2000001",
      fecha: "2026-10-14",
      url: "https://www.sec.gov/Archives/edgar/data/2000001/000200000126000001/0002000001-26-000001-index.htm",
      archivo: "edgar/data/2000001/0002000001-26-000001.txt",
      indice_fecha: "2026-10-14",
      fuente_id: "sec_edgar",
    });
    expect(r.operaciones.find((o) => o.form === "425")?.tipo).toBe("fusion");
  });
});

describe("fechas e URLs", () => {
  it("urlIndiceSec usa el trimestre correcto", () => {
    expect(urlIndiceSec("2026-10-14")).toBe("https://www.sec.gov/Archives/edgar/daily-index/2026/QTR4/form.20261014.idx");
    expect(urlIndiceSec("2026-03-31")).toBe("https://www.sec.gov/Archives/edgar/daily-index/2026/QTR1/form.20260331.idx");
  });

  it("urlPresentacion rechaza rutas raras", () => {
    expect(urlPresentacion("edgar/data/1/x.txt")).toBeNull();
  });

  it("día hábil anterior y hoy (Nueva York)", () => {
    expect(diasIndiceSec(new Date("2026-10-15T15:00:00Z"))).toEqual(["2026-10-14", "2026-10-15"]);
    // Lunes: el anterior es el viernes
    expect(diasIndiceSec(new Date("2026-10-19T15:00:00Z"))).toEqual(["2026-10-16", "2026-10-19"]);
    // Domingo: solo el viernes
    expect(diasIndiceSec(new Date("2026-10-18T15:00:00Z"))).toEqual(["2026-10-16"]);
    // 11:40 PM RD del jueves = 03:40 UTC del viernes, pero en Nueva York sigue siendo jueves
    expect(diasIndiceSec(new Date("2026-10-16T03:40:00Z"))).toEqual(["2026-10-14", "2026-10-15"]);
  });
});

describe("tarea sec-edgar", () => {
  const ahora = () => new Date("2026-10-15T15:40:00Z");
  const ok = (url: string, texto: string): Respuesta => ({ url, status: 200, tipo: "text/plain", texto, intentos: 1 });

  it("lee ayer; el de hoy todavía no existe (404) y no es error", async () => {
    const { almacen, tablas } = almacenMemoria();
    const pedidas: string[] = [];
    const r = await correrTarea(tareaSec, almacen, {
      ahora,
      obtener: async (url) => {
        pedidas.push(url);
        if (url.endsWith("form.20261015.idx")) throw new ErrorIngesta(`HTTP 404 en ${url}`, url, 404);
        return ok(url, REAL);
      },
    });
    expect(pedidas).toEqual([urlIndiceSec("2026-10-14"), urlIndiceSec("2026-10-15")]);
    expect(r.estado).toBe("ok");
    expect(r.detalle).toMatchObject({ leidos: ["2026-10-14"], sin_indice: ["2026-10-15"], operaciones: 0 });
    expect(tablas.operaciones_sec).toBeUndefined();
  });

  it("un 403 (bloqueo) se reporta y no se esquiva", async () => {
    const { almacen } = almacenMemoria();
    const r = await correrTarea(tareaSec, almacen, {
      ahora,
      obtener: async (url) => {
        throw new ErrorIngesta(`HTTP 403 en ${url}`, url, 403);
      },
    });
    expect(r.estado).toBe("error");
    expect(r.error).toMatch(/HTTP 403/);
  });
});
