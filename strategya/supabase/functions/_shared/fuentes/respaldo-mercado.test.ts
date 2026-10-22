import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { almacenMemoria } from "../../../../pruebas/apoyo/almacen-memoria.ts";
import type { Respuesta } from "../http.ts";
import { correrTarea } from "../ingesta.ts";
import {
  horaNuevaYork,
  parsearIndicesCboe,
  parsearQuoteCboe,
  filaCboe,
  tareaCotizacionesCboe,
  tocaLeer,
  urlQuoteCboe,
  URL_INDICES_CBOE,
} from "./cboe.ts";
import { filasFxBce, parsearFxBce, tareaDivisasBce } from "./ecb-fx.ts";
import { filasFredMercado, parsearCsvFredMercado, SERIES_FRED_MERCADO, tareaCierresFred } from "./fred-mercado.ts";

// Muestras REALES del 16 oct 2026 (sondas/lotes/hechos/30-mercado-gratis.txt). all_us_indices es un recorte
// (6 de 811 registros, copiados tal cual).
const muestra = (...p: string[]) => readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "pruebas", "muestras", ...p), "utf8");
const INDICES = muestra("cboe", "all_us_indices-recorte-real-2026-10-16.json");
const SPY = muestra("cboe", "quote-SPY-real-2026-10-16.json");
const GLD = muestra("cboe", "quote-GLD-real-2026-10-16.json");
const FX = muestra("bce-fx", "eurofxref-daily-real-2026-10-16.xml");
const BRENT = muestra("fred-mercado", "DCOILBRENTEU-real-2026-10-16.csv");
const SP500 = muestra("fred-mercado", "SP500-real-2026-10-16.csv");
const ok = (url: string, texto: string): Respuesta => ({ url, status: 200, tipo: "application/json", texto, intentos: 1 });

describe("Cboe", () => {
  it("hora de Nueva York sin zona → UTC (horario de verano: +4 h)", () => {
    expect(horaNuevaYork("2026-10-16T16:02:40")).toEqual({ dia: "2026-10-16", hora: new Date("2026-10-16T20:02:40Z") });
    expect(horaNuevaYork("2026-12-01T16:00:00").hora.toISOString()).toBe("2026-12-01T21:00:00.000Z");
    expect(() => horaNuevaYork("16/10/2026")).toThrow(/hora inválida/);
  });

  it("índices: solo los pedidos, con el texto exacto de los números", () => {
    const c = parsearIndicesCboe(INDICES, ["^SPX", "^NDX", "^VIX"]);
    expect(c.map((x) => x.simbolo)).toEqual(["^NDX", "^SPX", "^VIX"]);
    const spx = c.find((x) => x.simbolo === "^SPX")!;
    expect(spx).toMatchObject({ precio: "7659.4199", cambio: "-84.6401", cambioPct: "-1.093", dia: "2026-10-16" });
    expect(filaCboe(spx, "IDX_SPX")).toEqual({
      serie_id: "IDX_SPX",
      valor: "7659.4199",
      cambio: "-84.6401",
      cambio_pct: "-1.093",
      fecha_dato: "2026-10-16",
      hora_dato: "2026-10-16T20:02:40.000Z",
      url_dato: "https://www.cboe.com/us/indices/",
      fuente_id: "cboe",
    });
  });

  it("ETF: quote por símbolo; ^ se escribe _ en la URL", () => {
    expect(parsearQuoteCboe(GLD)).toMatchObject({ simbolo: "GLD", precio: "381.9", cambio: "-0.7", cambioPct: "-0.1829" });
    expect(urlQuoteCboe("^SPX")).toBe("https://cdn.cboe.com/api/global/delayed_quotes/quotes/_SPX.json");
    expect(parsearQuoteCboe('{"data":{"symbol":"X","current_price":0,"last_trade_time":"2026-10-16T16:00:00"}}')).toBeNull();
    expect(() => parsearQuoteCboe("[]")).toThrow(/formato inesperado/);
  });

  it("cuándo leer: abierto sí; cerrado solo hasta capturar el cierre", () => {
    expect(tocaLeer(new Date("2026-10-16T15:00:00Z"), null).leer).toBe(true);
    // Cierre 20:00 UTC: a las 20:10 todavía (dato diferido 15 min).
    expect(tocaLeer(new Date("2026-10-16T20:10:00Z"), new Date("2026-10-16T20:05:00Z")).leer).toBe(true);
    expect(tocaLeer(new Date("2026-10-16T21:00:00Z"), new Date("2026-10-16T20:25:00Z")).leer).toBe(false);
    // Fin de semana sin lectura previa del cierre: lee una vez.
    expect(tocaLeer(new Date("2026-10-17T15:00:00Z"), new Date("2026-10-16T19:00:00Z")).leer).toBe(true);
    expect(tocaLeer(new Date("2026-10-17T15:00:00Z"), null).leer).toBe(true);
  });

  const estado = {
    llamadas_hoy: 0,
    series: [
      { id: "IDX_NDX", simbolo: "^NDX", mercado: "us_acciones", ultimo_intento: null, ultimo_ok: null, denegado_hasta: null },
      { id: "IDX_VIX", simbolo: "^VIX", mercado: "us_acciones", ultimo_intento: null, ultimo_ok: null, denegado_hasta: null },
    ],
  };

  it("sin claves de FMP ni Finnhub: llena índices y ETF, cada fila con fuente cboe", async () => {
    const { almacen, observaciones, tablas } = almacenMemoria({ rpc: (f) => (f === "estado_planificador" ? estado : null) });
    const vistas: string[] = [];
    const r = await correrTarea(tareaCotizacionesCboe, almacen, {
      ahora: () => new Date("2026-10-16T19:00:00Z"),
      obtener: async (url) => {
        vistas.push(url);
        return ok(url, url === URL_INDICES_CBOE ? INDICES : url.endsWith("/GLD.json") ? GLD : SPY);
      },
      entorno: () => undefined,
    });
    expect(r.estado).toBe("ok");
    expect(vistas[0]).toBe(URL_INDICES_CBOE);
    expect(vistas).toHaveLength(13);
    const ids = observaciones.map((o) => o.serie_id);
    expect(ids.slice(0, 4)).toEqual(["IDX_SPX", "IDX_RUT", "IDX_NDX", "IDX_VIX"]);
    expect(ids).toContain("ETF_GLD");
    expect(observaciones.every((o) => o.fuente_id === "cboe")).toBe(true);
    expect(tablas.consultas_api?.length).toBe(16);
  });

  it("con las claves de FMP y Finnhub: solo Nasdaq 100 y VIX (una llamada)", async () => {
    const { almacen, observaciones } = almacenMemoria({ rpc: (f) => (f === "estado_planificador" ? estado : null) });
    const vistas: string[] = [];
    await correrTarea(tareaCotizacionesCboe, almacen, {
      ahora: () => new Date("2026-10-16T19:00:00Z"),
      obtener: async (url) => (vistas.push(url), ok(url, INDICES)),
      entorno: () => "clave",
    });
    expect(vistas).toEqual([URL_INDICES_CBOE]);
    expect(observaciones.map((o) => o.serie_id)).toEqual(["IDX_NDX", "IDX_VIX"]);
  });

  it("cerrado y con el cierre ya leído: no llama", async () => {
    const leidas = { ...estado, series: estado.series.map((s) => ({ ...s, ultimo_ok: "2026-10-16T20:25:00Z" })) };
    const { almacen } = almacenMemoria({ rpc: (f) => (f === "estado_planificador" ? leidas : null) });
    const r = await correrTarea(tareaCotizacionesCboe, almacen, {
      ahora: () => new Date("2026-10-17T15:00:00Z"),
      obtener: async () => { throw new Error("no debe llamar"); },
      entorno: () => undefined,
    });
    expect(r.detalle).toMatchObject({ omitida: expect.any(String) });
  });
});

describe("BCE · tipos de referencia", () => {
  it("EUR/USD publicado y USD/JPY como cruce exacto JPY÷USD", () => {
    const t = parsearFxBce(FX);
    expect(t.fecha).toBe("2026-10-16");
    expect(t.tasas).toMatchObject({ USD: "1.1253", JPY: "177.82" });
    const f = filasFxBce(t);
    expect(f).toEqual([
      { serie_id: "EURUSD", valor: "1.1253", fecha_dato: "2026-10-16", hora_dato: "2026-10-16T12:15:00.000Z", url_dato: expect.any(String), fuente_id: "bce_fx" },
      // 177.82 / 1.1253 = 158.0200835… → 158.0201
      { serie_id: "USDJPY", valor: "158.0201", fecha_dato: "2026-10-16", hora_dato: "2026-10-16T12:15:00.000Z", url_dato: expect.any(String), fuente_id: "bce_fx" },
    ]);
  });

  it("con clave de FMP también lee (referencia oficial y base del cruce EUR/DOP)", async () => {
    const { almacen, observaciones } = almacenMemoria();
    const r = await correrTarea(tareaDivisasBce, almacen, {
      obtener: async (url) => ok(url, FX),
      entorno: (n) => (n === "FMP_API_KEY" ? "x" : undefined),
    });
    expect(r.estado).toBe("ok");
    expect(observaciones.map((o) => o.fuente_id)).toEqual(["bce_fx", "bce_fx"]);
  });

  it("formato roto: error, nada inventado", () => {
    expect(() => parsearFxBce("<html></html>")).toThrow(/formato inesperado/);
  });
});

describe("FRED · cierres diarios", () => {
  it("lee la columna de la serie, salta días vacíos y guarda las últimas 10", () => {
    const d = parsearCsvFredMercado(BRENT, "DCOILBRENTEU");
    expect(d).toHaveLength(10);
    expect(d.at(-1)).toEqual({ fecha: "2026-10-14", valor: "126.55" });
    expect(parsearCsvFredMercado("observation_date,X\n2026-10-01,.\n2026-10-02,\n2026-10-03,5.10\n", "X")).toEqual([{ fecha: "2026-10-03", valor: "5.1" }]);
    expect(() => parsearCsvFredMercado(SP500, "DJIA")).toThrow(/no se encontró la columna DJIA/);
  });

  it("serie propia sin hora; respaldo de FMP con la hora del cierre de Nueva York", () => {
    const wti = SERIES_FRED_MERCADO.find((s) => s.serie === "WTI")!;
    const brent = SERIES_FRED_MERCADO.find((s) => s.serie === "BRENT")!;
    const d = [{ fecha: "2026-10-14", valor: "126.55" }];
    expect(filasFredMercado(wti, d)[0]).toEqual({
      serie_id: "WTI", valor: "126.55", fecha_dato: "2026-10-14", url_dato: "https://fred.stlouisfed.org/series/DCOILWTICO", fuente_id: "fred",
    });
    expect(filasFredMercado(brent, d)[0].hora_dato).toBe("2026-10-14T20:00:00.000Z");
  });

  it("con clave de FMP solo pide WTI y gas natural", async () => {
    const { almacen, observaciones } = almacenMemoria();
    const vistas: string[] = [];
    const csv = (id: string) => `observation_date,${id}\n2026-10-13,3.10\n2026-10-14,3.20\n`;
    const r = await correrTarea(tareaCierresFred, almacen, {
      ahora: () => new Date("2026-10-16T12:40:00Z"),
      obtener: async (url) => {
        vistas.push(url);
        return ok(url, csv(new URL(url).searchParams.get("id")!));
      },
      entorno: (n) => (n === "FMP_API_KEY" ? "x" : undefined),
    });
    expect(r.estado).toBe("ok");
    expect(vistas.map((u) => new URL(u).searchParams.get("id"))).toEqual(["DCOILWTICO", "DHHNGSP"]);
    expect(vistas[0]).toContain("cosd=2026-09-25");
    expect(new Set(observaciones.map((o) => o.serie_id))).toEqual(new Set(["WTI", "GAS_NATURAL"]));
  });
});
