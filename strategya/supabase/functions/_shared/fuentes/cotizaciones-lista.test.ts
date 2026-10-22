// Tarea cotizaciones-lista (Mi lista y Mis posiciones) con las muestras REALES de Cboe del 16 oct 2026.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { almacenMemoria } from "../../../../pruebas/apoyo/almacen-memoria.ts";
import { ErrorIngesta, type Respuesta } from "../http.ts";
import { correrTarea } from "../ingesta.ts";
import { parsearQuoteCboe } from "./cboe.ts";
import { filaCotizacionLista, leerLista, MOTIVO_NO_PUBLICA, tareaCotizacionesLista } from "./cotizaciones-lista.ts";

const muestra = (n: string) => readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "pruebas", "muestras", "cboe", n), "utf8");
const SPY = muestra("quote-SPY-real-2026-10-16.json");
const GLD = muestra("quote-GLD-real-2026-10-16.json");
const ok = (url: string, texto: string): Respuesta => ({ url, status: 200, tipo: "application/json", texto, intentos: 1 });

/** Con la bolsa abierta (vie 16 oct 2026, 11:00 a. m. de Nueva York). */
const ABIERTO = new Date("2026-10-16T15:00:00Z");

function obtenerFalso(pedidas: string[]) {
  return async (url: string) => {
    pedidas.push(url);
    if (url.endsWith("/SPY.json")) return ok(url, SPY);
    if (url.endsWith("/GLD.json")) return ok(url, GLD);
    if (url.endsWith("/NOEXISTE.json")) throw new ErrorIngesta("HTTP 404", url, 404);
    throw new Error("error de red: fetch failed");
  };
}

describe("cotización de acción de Cboe", () => {
  it("lee máximo, mínimo y cierre anterior con el texto exacto", () => {
    const c = parsearQuoteCboe(SPY)!;
    expect(c).toMatchObject({ simbolo: "SPY", precio: "762.69", cambio: "-8.56", cambioPct: "-1.1091", maximo: "773.25", minimo: "760.64", cierreAnterior: "771.79", dia: "2026-10-16" });
    const f = filaCotizacionLista("SPY", c, new Date("2026-10-16T20:25:00Z"));
    expect(f).toEqual({
      simbolo: "SPY",
      fecha: "2026-10-16",
      precio: "762.69",
      cierre_anterior: "771.79",
      cambio: "-8.56",
      cambio_pct: "-1.1091",
      maximo: "773.25",
      minimo: "760.64",
      hora_dato: "2026-10-16T20:00:00.000Z",
      fuente: "cboe",
      url_dato: "https://cdn.cboe.com/api/global/delayed_quotes/quotes/SPY.json",
      recogido_en: "2026-10-16T20:25:00.000Z",
    });
  });

  it("la lista de la base se lee sin lanzar aunque venga rota", () => {
    expect(leerLista(null)).toEqual({ simbolos: [], omitidos: [], ultimo_ok: null });
    expect(leerLista({ simbolos: ["SPY", 3], omitidos: "x", ultimo_ok: "2026-10-16T20:00:00Z" })).toEqual({
      simbolos: ["SPY"],
      omitidos: [],
      ultimo_ok: "2026-10-16T20:00:00Z",
    });
  });
});

describe("tarea cotizaciones-lista", () => {
  it("sin símbolos: no llama a Cboe", async () => {
    const m = almacenMemoria({ rpc: () => ({ simbolos: [], omitidos: [], ultimo_ok: null }) });
    const pedidas: string[] = [];
    const r = await correrTarea(tareaCotizacionesLista, m.almacen, { ahora: () => ABIERTO, obtener: obtenerFalso(pedidas) });
    expect(r.estado).toBe("ok");
    expect(pedidas).toEqual([]);
    expect(m.llamadasRpc.map((x) => x.funcion)).toEqual(["simbolos_lista"]);
  });

  it("guarda en cotizaciones_cartera con fuente cboe y marca el 404 para no reintentar", async () => {
    const m = almacenMemoria({ rpc: () => ({ simbolos: ["SPY", "gld", "NOEXISTE", "MAL SIMBOLO"], omitidos: ["VIEJO"], ultimo_ok: null }) });
    const pedidas: string[] = [];
    const r = await correrTarea(tareaCotizacionesLista, m.almacen, { ahora: () => ABIERTO, obtener: obtenerFalso(pedidas) });
    expect(r.estado).toBe("parcial");
    expect(pedidas.map((u) => u.split("/").at(-1))).toEqual(["SPY.json", "GLD.json", "NOEXISTE.json"]);
    expect(m.tablas.cotizaciones_cartera.map((f) => [f.simbolo, f.precio, f.fuente, f.maximo, f.minimo])).toEqual([
      ["SPY", "762.69", "cboe", "773.25", "760.64"],
      ["GLD", "381.9", "cboe", "384.88", "380.9"],
    ]);
    expect(m.tablas.simbolos_sin_cotizacion).toEqual([
      { simbolo: "NOEXISTE", fuente: "cboe", motivo: MOTIVO_NO_PUBLICA, marcado_en: ABIERTO.toISOString() },
    ]);
    expect(r.detalle).toMatchObject({ leidos: 2, no_publicados: ["NOEXISTE"], omitidos: ["VIEJO"], fallidos: 0 });
  });

  it("con la bolsa cerrada y el cierre ya leído, no pide nada", async () => {
    const m = almacenMemoria({ rpc: () => ({ simbolos: ["SPY"], omitidos: [], ultimo_ok: "2026-10-16T20:25:00Z" }) });
    const pedidas: string[] = [];
    const r = await correrTarea(tareaCotizacionesLista, m.almacen, {
      ahora: () => new Date("2026-10-17T14:00:00Z"),
      obtener: obtenerFalso(pedidas),
    });
    expect(r.estado).toBe("ok");
    expect(pedidas).toEqual([]);
  });

  it("un símbolo nuevo (nunca leído) se lee aunque la bolsa esté cerrada", async () => {
    const m = almacenMemoria({ rpc: () => ({ simbolos: ["SPY"], omitidos: [], ultimo_ok: null }) });
    const pedidas: string[] = [];
    await correrTarea(tareaCotizacionesLista, m.almacen, { ahora: () => new Date("2026-10-17T14:00:00Z"), obtener: obtenerFalso(pedidas) });
    expect(pedidas).toHaveLength(1);
  });

  it("si todo falla por red, la corrida queda en error (visible en Estado)", async () => {
    const m = almacenMemoria({ rpc: () => ({ simbolos: ["QQQ"], omitidos: [], ultimo_ok: null }) });
    const r = await correrTarea(tareaCotizacionesLista, m.almacen, { ahora: () => ABIERTO, obtener: obtenerFalso([]) });
    expect(r.estado).toBe("error");
    expect(m.tablas.cotizaciones_cartera).toBeUndefined();
  });
});
