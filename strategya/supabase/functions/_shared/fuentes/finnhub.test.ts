import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { almacenMemoria } from "../../../../pruebas/apoyo/almacen-memoria.ts";
import type { OpcionesApi, Respuesta } from "../http.ts";
import { correrTarea } from "../ingesta.ts";
import { filaFinnhub, parsearQuoteFinnhub, tareaCotizacionesFinnhub } from "./finnhub.ts";

// SINTÉTICA: reemplazar por real (pruebas/muestras/finnhub/LEEME-SINTETICA.txt, sondas/lotes/21-finnhub.txt).
const MUESTRA = readFileSync(
  join(import.meta.dirname, "..", "..", "..", "..", "pruebas", "muestras", "finnhub", "quote-SPY-SINTETICA.json"),
  "utf8",
);

describe("parsearQuoteFinnhub", () => {
  it("lee c, d, dp, pc y t sin pasar por float", () => {
    const c = parsearQuoteFinnhub(MUESTRA)!;
    expect(c).toMatchObject({ precio: "671.2", cambio: "-3.15", cambioPct: "-0.4671", cierrePrevio: "674.35" });
    expect(c.hora.toISOString()).toBe("2026-10-15T20:00:00.000Z");
  });

  it("fila con hora del dato y día de negociación de Nueva York", () => {
    expect(filaFinnhub(parsearQuoteFinnhub(MUESTRA)!, "ETF_SPY")).toEqual({
      serie_id: "ETF_SPY",
      valor: "671.2",
      cambio: "-3.15",
      cambio_pct: "-0.4671",
      fecha_dato: "2026-10-15",
      hora_dato: "2026-10-15T20:00:00.000Z",
    });
  });

  it("símbolo sin datos (c = 0, t = 0) devuelve null; un error se reporta", () => {
    expect(parsearQuoteFinnhub('{"c":0,"d":null,"dp":null,"h":0,"l":0,"o":0,"pc":0,"t":0}')).toBeNull();
    expect(() => parsearQuoteFinnhub('{"error":"Invalid API key"}')).toThrow(/Invalid API key/);
  });
});

describe("tarea cotizaciones-finnhub", () => {
  const estado = {
    llamadas_hoy: 0,
    series: [
      { id: "COBRE_CPER", simbolo: "CPER", mercado: "us_acciones", ultimo_intento: null, ultimo_ok: null, denegado_hasta: null },
      { id: "ETF_SPY", simbolo: "SPY", mercado: "us_acciones", ultimo_intento: null, ultimo_ok: null, denegado_hasta: null },
    ],
  };

  it("sin FINNHUB_API_KEY termina parcial sin llamar", async () => {
    const { almacen, llamadasRpc } = almacenMemoria();
    const r = await correrTarea(tareaCotizacionesFinnhub, almacen, {
      obtener: async () => { throw new Error("no"); },
      entorno: () => undefined,
    });
    expect(r).toMatchObject({ estado: "parcial", error: "Falta FINNHUB_API_KEY" });
    expect(llamadasRpc).toEqual([]);
  });

  it("en horario: pide cada ETF con la clave en el encabezado (no en la URL)", async () => {
    const { almacen, observaciones } = almacenMemoria({ rpc: (f) => (f === "estado_planificador" ? estado : null) });
    const vistas: { url: string; op?: OpcionesApi }[] = [];
    const r = await correrTarea(tareaCotizacionesFinnhub, almacen, {
      ahora: () => new Date("2026-10-15T15:00:00Z"),
      obtener: async () => { throw new Error("no"); },
      api: async (url, op): Promise<Respuesta> => {
        vistas.push({ url, op });
        return { url, status: 200, tipo: "application/json", texto: MUESTRA, intentos: 1 };
      },
      entorno: (n) => (n === "FINNHUB_API_KEY" ? "tok" : undefined),
    });
    expect(r.estado).toBe("ok");
    expect(vistas.map((v) => v.url)).toEqual(["https://finnhub.io/api/v1/quote?symbol=CPER", "https://finnhub.io/api/v1/quote?symbol=SPY"]);
    expect(vistas[0].op?.encabezados).toEqual({ "X-Finnhub-Token": "tok" });
    expect(observaciones.map((o) => o.serie_id)).toEqual(["COBRE_CPER", "ETF_SPY"]);
  });

  it("fin de semana: no llama", async () => {
    const vistos = estado.series.map((x) => ({ ...x, ultimo_intento: "2026-10-16T20:02:00Z", ultimo_ok: "2026-10-16T20:02:00Z" }));
    const { almacen } = almacenMemoria({ rpc: (f) => (f === "estado_planificador" ? { ...estado, series: vistos } : null) });
    const r = await correrTarea(tareaCotizacionesFinnhub, almacen, {
      ahora: () => new Date("2026-10-17T15:00:00Z"),
      obtener: async () => { throw new Error("no"); },
      api: async () => { throw new Error("no debe llamar"); },
      entorno: () => "tok",
    });
    expect(r.estado).toBe("ok");
    expect(r.detalle).toMatchObject({ omitida: expect.any(String) });
  });
});
