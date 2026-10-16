import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { almacenMemoria } from "../../../../pruebas/apoyo/almacen-memoria.ts";
import { ErrorIngesta, type Respuesta } from "../http.ts";
import { correrTarea } from "../ingesta.ts";
import { fechaNuevaYork, parsearCotizacionFinnhub, tareaPreciosCartera, urlCotizacion, urlPublicaCotizacion } from "./precios-cartera.ts";

// SINTÉTICAS: reemplazar por real (ver pruebas/muestras/finnhub-cartera/LEEME-SINTETICA.txt).
const carpeta = join(import.meta.dirname, "..", "..", "..", "..", "pruebas", "muestras", "finnhub-cartera");
const QUOTE = readFileSync(join(carpeta, "quote-EJEMPLO-SINTETICA.json"), "utf8");
const DESCONOCIDO = readFileSync(join(carpeta, "quote-desconocido-SINTETICA.json"), "utf8");
const ERROR_TOKEN = readFileSync(join(carpeta, "error-token-SINTETICA.json"), "utf8");
const AHORA = new Date("2026-10-15T21:30:00Z");

describe("parsearCotizacionFinnhub", () => {
  it("lee c y pc como texto exacto y fecha el dato con el día de Nueva York de t", () => {
    const { fila } = parsearCotizacionFinnhub(QUOTE, "EJEMPLO", AHORA);
    expect(fila).toEqual({
      simbolo: "EJEMPLO",
      fecha: "2026-10-15",
      precio: "101.37",
      cierre_anterior: "102.2",
      cambio: "-0.83",
      cambio_pct: "-0.8121",
      hora_dato: "2026-10-15T20:00:00.000Z",
      fuente: "finnhub",
      url_dato: "https://finnhub.io/api/v1/quote?symbol=EJEMPLO",
      recogido_en: "2026-10-15T21:30:00.000Z",
    });
  });

  it("un símbolo que Finnhub no conoce (todo en 0) no produce fila: no se inventa un precio", () => {
    const r = parsearCotizacionFinnhub(DESCONOCIDO, "NOEXISTE", AHORA);
    expect(r.fila).toBeNull();
    expect(r.motivo).toMatch(/no tiene cotización/);
  });

  it("una respuesta de error se reporta con su mensaje", () => {
    expect(parsearCotizacionFinnhub(ERROR_TOKEN, "SPY", AHORA).motivo).toMatch(/Invalid API key/);
  });

  it("rechaza JSON roto y formatos inesperados", () => {
    expect(parsearCotizacionFinnhub("<html>", "SPY", AHORA).fila).toBeNull();
    expect(parsearCotizacionFinnhub("[1,2]", "SPY", AHORA).fila).toBeNull();
    expect(parsearCotizacionFinnhub('{"c":-5,"t":1792094400}', "SPY", AHORA).fila).toBeNull();
  });

  it("no pierde dígitos que un float perdería", () => {
    const { fila } = parsearCotizacionFinnhub('{"c":0.1000000000000000055511,"pc":0,"t":1792094400}', "X", AHORA);
    expect(fila?.precio).toBe("0.1000000000000000055511");
    expect(fila?.cierre_anterior).toBeNull();
  });
});

describe("fechaNuevaYork", () => {
  it("a las 11 PM de Nueva York sigue siendo el mismo día aunque en UTC ya sea otro", () => {
    expect(fechaNuevaYork(new Date("2026-10-15T03:30:00Z"))).toBe("2026-10-14");
  });
});

describe("tarea precios-cartera", () => {
  const respuesta = (url: string, texto: string): Respuesta => ({ url, status: 200, tipo: "application/json", texto, intentos: 1 });

  it("sin FINNHUB_API_KEY termina en parcial y no llama a nada", async () => {
    const { almacen, cierres, llamadasRpc } = almacenMemoria();
    let llamadas = 0;
    const r = await correrTarea(tareaPreciosCartera, almacen, {
      obtener: async () => {
        throw new Error("no debe leer páginas");
      },
      api: async () => {
        llamadas++;
        throw new Error("no debe llamar");
      },
      entorno: () => undefined,
    });
    expect(r.estado).toBe("parcial");
    expect(r.error).toBe("Falta FINNHUB_API_KEY");
    expect(llamadas).toBe(0);
    expect(llamadasRpc).toEqual([]);
    expect(cierres).toHaveLength(1);
  });

  it("pide cada símbolo de la cartera, guarda los que tienen precio y avisa los que no", async () => {
    const { almacen, tablas, llamadasRpc } = almacenMemoria({ rpc: () => ["EJEMPLO", "NOEXISTE"] });
    const pedidas: string[] = [];
    const r = await correrTarea(tareaPreciosCartera, almacen, {
      ahora: () => AHORA,
      obtener: async () => {
        throw new Error("no usa obtener");
      },
      api: async (url) => {
        pedidas.push(url);
        return respuesta(url, url.includes("EJEMPLO") ? QUOTE : DESCONOCIDO);
      },
      entorno: (n) => (n === "FINNHUB_API_KEY" ? "clave-de-prueba" : undefined),
    });
    expect(llamadasRpc).toEqual([{ funcion: "simbolos_cartera", args: undefined }]);
    expect(pedidas).toEqual([urlCotizacion("EJEMPLO", "clave-de-prueba"), urlCotizacion("NOEXISTE", "clave-de-prueba")]);
    expect(tablas.cotizaciones_cartera).toHaveLength(1);
    expect(tablas.cotizaciones_cartera[0]).toMatchObject({ simbolo: "EJEMPLO", precio: "101.37", url_dato: urlPublicaCotizacion("EJEMPLO") });
    expect(r.estado).toBe("parcial");
    expect(r.error).toMatch(/NOEXISTE/);
    expect(JSON.stringify(r)).not.toContain("clave-de-prueba");
  });

  it("cartera sin símbolos: ok sin llamar a la API", async () => {
    const { almacen } = almacenMemoria({ rpc: () => [] });
    let llamadas = 0;
    const r = await correrTarea(tareaPreciosCartera, almacen, {
      obtener: async () => respuesta("", ""),
      api: async () => {
        llamadas++;
        return respuesta("", "");
      },
      entorno: () => "k",
    });
    expect(r.estado).toBe("ok");
    expect(llamadas).toBe(0);
  });

  it("si todos fallan la corrida es error y la clave no aparece en el mensaje", async () => {
    const { almacen } = almacenMemoria({ rpc: () => ["SPY"] });
    const r = await correrTarea(tareaPreciosCartera, almacen, {
      obtener: async () => respuesta("", ""),
      api: async (url) => {
        throw new ErrorIngesta(`HTTP 401 en ${url.replace(/token=[^&]+/, "token=***")}`, url, 401);
      },
      entorno: () => "secreta",
    });
    expect(r.estado).toBe("error");
    expect(r.error).toMatch(/401/);
    expect(r.error).not.toContain("secreta");
  });
});
