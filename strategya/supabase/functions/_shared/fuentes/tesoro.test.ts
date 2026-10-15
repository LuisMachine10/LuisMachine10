import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Respuesta } from "../http.ts";
import { type Almacen, correrTarea, type FilaObservacion } from "../ingesta.ts";
import { CAMPOS_TESORO, mesesAConsultar, parsearXmlTesoro, tareaTesoro, urlPaginaTesoro, urlXmlTesoro } from "./tesoro.ts";

// Descarga real del 15 oct 2026 (sonda en GitHub Actions). No se edita a mano.
const XML_OCT = readFileSync(
  join(import.meta.dirname, "..", "..", "..", "..", "pruebas", "muestras", "tesoro", "daily_treasury_yield_curve_202610.xml"),
  "utf8",
);

const valor = (filas: FilaObservacion[], serie: string, fecha: string) =>
  filas.find((f) => f.serie_id === serie && f.fecha_dato === fecha)?.valor;

describe("parsearXmlTesoro · muestra real de octubre 2026", () => {
  const lectura = parsearXmlTesoro(XML_OCT, urlPaginaTesoro("202610"));

  it("lee los 9 días hábiles publicados (el 12 oct, Columbus Day, no hubo mercado)", () => {
    expect(lectura.fechas).toEqual([
      "2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07",
      "2026-10-08", "2026-10-09", "2026-10-13", "2026-10-14",
    ]);
    expect(lectura.advertencias).toEqual([]);
  });

  it("trae los 14 plazos por día, incluido el de 6 semanas (BC_1_5MONTH)", () => {
    expect(lectura.filas).toHaveLength(9 * 14);
    expect(new Set(lectura.filas.map((f) => f.serie_id))).toEqual(new Set(Object.values(CAMPOS_TESORO)));
  });

  it("conserva el texto exacto de cada tasa (sin pasar por float)", () => {
    expect(valor(lectura.filas, "UST_10A", "2026-10-14")).toBe("5.19");
    expect(valor(lectura.filas, "UST_2A", "2026-10-14")).toBe("4.82");
    expect(valor(lectura.filas, "UST_5A", "2026-10-14")).toBe("5.00");
    expect(valor(lectura.filas, "UST_1_5M", "2026-10-01")).toBe("4.10");
    expect(valor(lectura.filas, "UST_30A", "2026-10-01")).toBe("5.61");
  });

  it("cada fila lleva el enlace a la página oficial del mes", () => {
    expect(lectura.filas[0].url_dato).toBe(
      "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve&field_tdr_date_value_month=202610",
    );
  });
});

describe("parsearXmlTesoro · casos límite", () => {
  const envoltura = (propiedades: string) =>
    `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:d="d" xmlns:m="m">
      <title type="text">DailyTreasuryYieldCurveRateData</title>
      <entry><content type="application/xml"><m:properties>${propiedades}</m:properties></content></entry></feed>`;

  it("un plazo vacío (m:null) se omite, no se inventa", () => {
    const r = parsearXmlTesoro(
      envoltura(`<d:NEW_DATE>2026-10-01T00:00:00</d:NEW_DATE><d:BC_1MONTH m:null="true" /><d:BC_10YEAR>5.24</d:BC_10YEAR>`),
      "u",
    );
    expect(r.filas.map((f) => f.serie_id)).toEqual(["UST_10A"]);
  });

  it("descarta y avisa valores no numéricos o fuera de rango", () => {
    const r = parsearXmlTesoro(
      envoltura(`<d:NEW_DATE>2026-10-01T00:00:00</d:NEW_DATE><d:BC_2YEAR>N/A</d:BC_2YEAR><d:BC_10YEAR>52.4</d:BC_10YEAR>`),
      "u",
    );
    expect(r.filas).toEqual([]);
    expect(r.advertencias).toHaveLength(2);
  });

  it("un mes sin publicaciones todavía no es un error", () => {
    const r = parsearXmlTesoro(
      `<feed xmlns="http://www.w3.org/2005/Atom"><title type="text">DailyTreasuryYieldCurveRateData</title></feed>`,
      "u",
    );
    expect(r).toEqual({ filas: [], fechas: [], advertencias: [] });
  });

  it("rechaza un documento que no es el feed esperado", () => {
    expect(() => parsearXmlTesoro("<html><body>Mantenimiento</body></html>", "u")).toThrow(/Formato inesperado/);
  });
});

describe("mesesAConsultar (fecha de Nueva York)", () => {
  it("mes en curso y anterior", () => {
    expect(mesesAConsultar(new Date("2026-10-15T15:00:00Z"))).toEqual(["202610", "202609"]);
  });
  it("cruza el año en enero", () => {
    expect(mesesAConsultar(new Date("2027-01-04T15:00:00Z"))).toEqual(["202701", "202612"]);
  });
  it("a las 11 PM del 31 en Nueva York sigue siendo el mes viejo aunque en UTC ya sea otro", () => {
    expect(mesesAConsultar(new Date("2026-11-01T03:30:00Z"))).toEqual(["202610", "202609"]);
  });
});

describe("tarea ingesta-tesoro de punta a punta (con almacén en memoria)", () => {
  function almacenMemoria() {
    const guardadas: FilaObservacion[] = [];
    const cierres: unknown[] = [];
    const almacen: Almacen = {
      iniciarCorrida: async () => 1,
      terminarCorrida: async (_id, c) => void cierres.push(c),
      registrarObservaciones: async (_id, filas) => {
        guardadas.push(...filas);
        return { recibidas: filas.length, insertadas: filas.length, actualizadas: 0 };
      },
    };
    return { almacen, guardadas, cierres };
  }

  const respuesta = (url: string, texto: string): Respuesta => ({ url, status: 200, tipo: "text/xml", texto, intentos: 1 });
  const vacio = `<feed xmlns="http://www.w3.org/2005/Atom"><title type="text">DailyTreasuryYieldCurveRateData</title></feed>`;
  const ahora = () => new Date("2026-10-15T22:15:00Z");

  it("guarda octubre y septiembre y cierra en ok", async () => {
    const { almacen, guardadas, cierres } = almacenMemoria();
    const pedidas: string[] = [];
    const r = await correrTarea(tareaTesoro, almacen, {
      ahora,
      obtener: async (url) => {
        pedidas.push(url);
        return respuesta(url, url === urlXmlTesoro("202610") ? XML_OCT : vacio);
      },
    });
    expect(pedidas).toEqual([urlXmlTesoro("202610"), urlXmlTesoro("202609")]);
    expect(r.estado).toBe("ok");
    expect(r.filas).toBe(126);
    expect(r.detalle).toMatchObject({ ultima_fecha: "2026-10-14", dias: 9 });
    expect(guardadas).toHaveLength(126);
    expect(cierres).toHaveLength(1);
  });

  it("si falla un mes guarda el otro y queda «parcial» con el motivo", async () => {
    const { almacen } = almacenMemoria();
    const r = await correrTarea(tareaTesoro, almacen, {
      ahora,
      obtener: async (url) => {
        if (url === urlXmlTesoro("202609")) throw new Error("HTTP 503");
        return respuesta(url, XML_OCT);
      },
    });
    expect(r.estado).toBe("parcial");
    expect(r.error).toMatch(/Mes 202609: HTTP 503/);
    expect(r.filas).toBe(126);
  });

  it("si fallan los dos meses la corrida queda en error y no se guarda nada", async () => {
    const { almacen, guardadas } = almacenMemoria();
    const r = await correrTarea(tareaTesoro, almacen, {
      ahora,
      obtener: async () => {
        throw new Error("sin red");
      },
    });
    expect(r.estado).toBe("error");
    expect(r.error).toMatch(/202610: sin red · Mes 202609: sin red/);
    expect(guardadas).toEqual([]);
  });
});
