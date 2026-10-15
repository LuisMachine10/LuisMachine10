import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { almacenMemoria } from "../../../../pruebas/apoyo/almacen-memoria.ts";
import { ErrorIngesta, type Respuesta } from "../http.ts";
import { correrTarea } from "../ingesta.ts";
import {
  filaFmp,
  limiteLlamadas,
  parsearMovimientos,
  parsearQuoteShort,
  tareaCotizacionesFmp,
  tareaMovimientosAcciones,
  urlQuoteShort,
} from "./fmp.ts";

const MUESTRAS = join(import.meta.dirname, "..", "..", "..", "..", "pruebas", "muestras", "fmp");
const leer = (archivo: string) => readFileSync(join(MUESTRAS, archivo), "utf8");

/** Texto crudo (exacto, sin pasar por JSON.parse) de la respuesta guardada bajo `clave`. */
function respuestaCruda(archivo: string, clave: string): string {
  for (const linea of leer(archivo).split("\n")) {
    const m = /^\s*"([^"]+)":\s*(\[.*\]),?\s*$/.exec(linea);
    if (m && m[1] === clave) return m[2];
  }
  throw new Error(`No está ${clave} en ${archivo}`);
}

const R1 = "quote-short-conector-2026-10-15.json";
const R2 = "quote-short-conector-2026-10-15-ronda2.json";
const MOV = "biggest-gainers-losers-conector-2026-10-15.json";

describe("parsearQuoteShort · muestras reales", () => {
  it("conserva el texto exacto de precio y cambio", () => {
    expect(parsearQuoteShort(respuestaCruda(R1, "^GSPC"))).toEqual([
      { simbolo: "^GSPC", precio: "7705.79", cambio: "-13.15", volumen: "785287574" },
    ]);
    expect(parsearQuoteShort(respuestaCruda(R1, "EURUSD"))[0]).toMatchObject({ precio: "1.1219", cambio: "0.00624" });
    expect(parsearQuoteShort(respuestaCruda(R1, "BTCUSD"))[0]).toMatchObject({ precio: "81200", cambio: "-1177.31408" });
    expect(parsearQuoteShort(respuestaCruda(R2, "^IXIC"))[0]).toMatchObject({ precio: "26673.031", cambio: "-19.839" });
    expect(parsearQuoteShort(respuestaCruda(R2, "USDJPY"))[0]).toMatchObject({ precio: "158.169", cambio: "-0.122" });
  });

  it("todas las respuestas reales se leen", () => {
    for (const s of ["^GSPC", "AAPL", "EURUSD", "GCUSD", "^N225", "SIUSD", "BZUSD", "BTCUSD", "^RUT"]) {
      expect(parsearQuoteShort(respuestaCruda(R1, s))).toHaveLength(1);
    }
    for (const s of ["^DJI", "^IXIC", "^STOXX50E", "^FTSE", "^HSI", "USDJPY"]) {
      expect(parsearQuoteShort(respuestaCruda(R2, s))).toHaveLength(1);
    }
  });

  it("un error dentro de un 200 no se guarda como dato", () => {
    expect(() => parsearQuoteShort('{"Error Message":"Invalid API KEY."}')).toThrow(/Invalid API KEY/);
    expect(parsearQuoteShort("[]")).toEqual([]);
  });
});

describe("filaFmp", () => {
  it("cambio de la fuente y % exacto = change / (price − change) × 100", () => {
    const [c] = parsearQuoteShort(respuestaCruda(R1, "^GSPC"));
    const f = filaFmp(c, "IDX_SPX", "us_acciones", new Date("2026-10-15T18:00:00Z"));
    // −13.15 / 7718.94 × 100 = −0.170360…
    expect(f).toEqual({
      serie_id: "IDX_SPX",
      valor: "7705.79",
      cambio: "-13.15",
      cambio_pct: "-0.17036",
      fecha_dato: "2026-10-15",
      hora_dato: "2026-10-15T18:00:00.000Z",
    });
    const [oro] = parsearQuoteShort(respuestaCruda(R1, "GCUSD"));
    expect(filaFmp(oro, "ORO", "futuros", new Date("2026-10-15T18:00:00Z")).cambio_pct).toBe("1.596923");
  });

  it("fecha_dato es el día de negociación: el Nikkei consultado de noche en RD es del día siguiente en Tokio", () => {
    const [c] = parsearQuoteShort(respuestaCruda(R1, "^N225"));
    expect(filaFmp(c, "IDX_N225", "asia", new Date("2026-10-15T01:00:00Z")).fecha_dato).toBe("2026-10-15");
  });

  it("la URL lleva el símbolo codificado y la clave solo como parámetro", () => {
    expect(urlQuoteShort("^GSPC", "k")).toBe("https://financialmodelingprep.com/stable/quote-short?symbol=%5EGSPC&apikey=k");
  });

  it("FMP_LLAMADAS_DIA", () => {
    expect(limiteLlamadas(undefined)).toEqual({ limite: 240 });
    expect(limiteLlamadas("3000")).toEqual({ limite: 3000 });
    expect(limiteLlamadas("mucho").limite).toBe(240);
  });
});

describe("parsearMovimientos · muestra real", () => {
  const datos = leer(MOV);
  const crudo = (clave: string) => {
    const m = new RegExp(`"${clave}":\\s*(\\[.*\\])`).exec(datos);
    return m![1];
  };
  it("las 10 primeras, en orden y con cifras exactas", () => {
    const sube = parsearMovimientos(crudo("biggest-gainers"));
    expect(sube).toHaveLength(10);
    expect(sube[0]).toEqual({
      posicion: 1, simbolo: "RPGL", nombre: "Republic Power Group Limited", precio: "36", cambio: "20.51",
      cambio_pct: "132.40801", bolsa: "NASDAQ",
    });
    const baja = parsearMovimientos(crudo("biggest-losers"), 3);
    expect(baja.map((m) => [m.simbolo, m.cambio_pct])).toEqual([["HAIN", "-51.40527"], ["SHFS", "-39.61207"], ["FMC", "-34.79604"]]);
  });
});

// ───────────────────────── tarea de punta a punta (memoria) ─────────────────────────

const ok = (url: string, texto: string): Respuesta => ({ url, status: 200, tipo: "application/json", texto, intentos: 1 });

function estadoSeries(extra: Partial<Record<string, unknown>> = {}) {
  return {
    llamadas_hoy: 0,
    series: [
      { id: "ORO", simbolo: "GCUSD", mercado: "futuros", ultimo_intento: null, ultimo_ok: null, denegado_hasta: null },
      { id: "IDX_SPX", simbolo: "^GSPC", mercado: "us_acciones", ultimo_intento: null, ultimo_ok: null, denegado_hasta: null },
      { id: "IDX_GDAXI", simbolo: "^GDAXI", mercado: "europa", ultimo_intento: null, ultimo_ok: null, denegado_hasta: null },
    ],
    ...extra,
  };
}

describe("tarea cotizaciones-fmp", () => {
  const ahora = () => new Date("2026-10-15T15:00:00Z"); // 11:00 NY, Europa abierta

  it("sin FMP_API_KEY termina parcial sin llamar a nada", async () => {
    const { almacen, llamadasRpc } = almacenMemoria();
    let llamadas = 0;
    const r = await correrTarea(tareaCotizacionesFmp, almacen, {
      ahora,
      obtener: async () => { throw new Error("no"); },
      api: async () => { llamadas++; throw new Error("no"); },
      entorno: () => undefined,
    });
    expect(r.estado).toBe("parcial");
    expect(r.error).toBe("Falta FMP_API_KEY");
    expect(llamadas).toBe(0);
    expect(llamadasRpc).toEqual([]);
  });

  it("reserva, pide, guarda; un símbolo negado (402) queda en pausa 24 h y la corrida es parcial", async () => {
    const reservas: unknown[] = [];
    const { almacen, observaciones, tablas } = almacenMemoria({
      rpc: (f, args) => {
        if (f === "estado_planificador") return estadoSeries();
        if (f === "reservar_llamadas") {
          reservas.push(args);
          return (args as { p_cantidad: number }).p_cantidad;
        }
        return null;
      },
    });
    const pedidas: string[] = [];
    const r = await correrTarea(tareaCotizacionesFmp, almacen, {
      ahora,
      obtener: async () => { throw new Error("no"); },
      api: async (url) => {
        pedidas.push(url);
        if (url.includes("GDAXI")) throw new ErrorIngesta("HTTP 402 en …", url, 402);
        if (url.includes("GCUSD")) return ok(url, respuestaCruda(R1, "GCUSD"));
        return ok(url, respuestaCruda(R1, "^GSPC"));
      },
      entorno: (n) => (n === "FMP_API_KEY" ? "clave-secreta" : undefined),
    });
    expect(r.estado).toBe("parcial");
    expect(r.error).toMatch(/IDX_GDAXI.*el plan no lo permite/);
    expect(reservas).toEqual([{ p_proveedor: "fmp", p_dia: "2026-10-15", p_cantidad: 3, p_limite: 240 }]);
    // Prioridad: ORO, luego IDX_SPX, luego el resto.
    expect(pedidas.map((u) => new URL(u).searchParams.get("symbol"))).toEqual(["GCUSD", "^GSPC", "^GDAXI"]);
    expect(observaciones.map((o) => [o.serie_id, o.valor, o.hora_dato])).toEqual([
      ["ORO", "4173.5", "2026-10-15T15:00:00.000Z"],
      ["IDX_SPX", "7705.79", "2026-10-15T15:00:00.000Z"],
    ]);
    const consultas = tablas.consultas_api;
    expect(consultas.find((c) => c.serie_id === "IDX_GDAXI")).toMatchObject({ denegado_hasta: "2026-10-16T15:00:00.000Z" });
    expect(consultas.find((c) => c.serie_id === "ORO")).toMatchObject({ ultimo_ok: "2026-10-15T15:00:00.000Z" });
    expect(JSON.stringify(r)).not.toContain("clave-secreta");
  });

  it("si el presupuesto concede menos llamadas, pide solo esas", async () => {
    const { almacen, observaciones } = almacenMemoria({
      rpc: (f) => (f === "estado_planificador" ? estadoSeries() : f === "reservar_llamadas" ? 1 : null),
    });
    const r = await correrTarea(tareaCotizacionesFmp, almacen, {
      ahora,
      obtener: async () => { throw new Error("no"); },
      api: async (url) => ok(url, respuestaCruda(R1, "GCUSD")),
      entorno: (n) => (n === "FMP_API_KEY" ? "k" : undefined),
    });
    expect(observaciones).toHaveLength(1);
    expect(r.error).toMatch(/se otorgaron 1 de 3/);
  });

  it("clave rechazada (401): error claro", async () => {
    const { almacen } = almacenMemoria({
      rpc: (f) => (f === "estado_planificador" ? estadoSeries() : f === "reservar_llamadas" ? 3 : null),
    });
    const r = await correrTarea(tareaCotizacionesFmp, almacen, {
      ahora,
      obtener: async () => { throw new Error("no"); },
      api: async (url) => { throw new ErrorIngesta("HTTP 401", url, 401); },
      entorno: (n) => (n === "FMP_API_KEY" ? "k" : undefined),
    });
    expect(r.estado).toBe("error");
    expect(r.error).toMatch(/rechazó la clave/);
  });
});

describe("tarea movimientos-acciones", () => {
  const datos = leer(MOV);
  const crudo = (clave: string) => new RegExp(`"${clave}":\\s*(\\[.*\\])`).exec(datos)![1];

  it("con el mercado cerrado no gasta llamadas", async () => {
    const { almacen, llamadasRpc } = almacenMemoria();
    const r = await correrTarea(tareaMovimientosAcciones, almacen, {
      ahora: () => new Date("2026-10-17T15:00:00Z"),
      obtener: async () => { throw new Error("no"); },
      api: async () => { throw new Error("no debe llamar"); },
      entorno: () => "k",
    });
    expect(r.estado).toBe("ok");
    expect(r.detalle).toMatchObject({ omitida: expect.stringMatching(/cerrado/) });
    expect(llamadasRpc).toEqual([]);
  });

  it("abierto: reserva 2 llamadas y reemplaza la lista del día", async () => {
    const { almacen, llamadasRpc } = almacenMemoria({ rpc: (f) => (f === "reservar_llamadas" ? 2 : 10) });
    const r = await correrTarea(tareaMovimientosAcciones, almacen, {
      ahora: () => new Date("2026-10-15T18:10:00Z"),
      obtener: async () => { throw new Error("no"); },
      api: async (url) => ok(url, crudo(url.includes("gainers") ? "biggest-gainers" : "biggest-losers")),
      entorno: (n) => (n === "FMP_API_KEY" ? "k" : undefined),
    });
    expect(r.estado).toBe("ok");
    const reemplazos = llamadasRpc.filter((l) => l.funcion === "reemplazar_movimientos");
    expect(reemplazos.map((l) => [l.args?.p_fecha, l.args?.p_tipo, (l.args?.p_filas as unknown[]).length])).toEqual([
      ["2026-10-15", "sube", 10],
      ["2026-10-15", "baja", 10],
    ]);
  });
});
