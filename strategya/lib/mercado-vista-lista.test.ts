// Mi lista y Mis posiciones: validación del símbolo, vista de la cotización y cuentas con big.js.
import Big from "big.js";
import { describe, expect, it } from "vitest";
import {
  armarLista,
  armarPosiciones,
  cifraCantidad,
  contextoLista,
  ultimaPorSimbolo,
  validarSimboloLista,
  vistaCotizacion,
  type CotizacionLista,
  type FuenteMercado,
} from "./mercado-vista";

const fuentes = new Map<string, FuenteMercado>([["cboe", { id: "cboe", nombre: "Cboe · cotizaciones diferidas", url: "https://www.cboe.com/us/indices/" }]]);

// Cifras de la muestra REAL pruebas/muestras/cboe/quote-SPY-real-2026-10-16.json y quote-GLD-real-2026-10-16.json.
const SPY: CotizacionLista = {
  simbolo: "SPY",
  fecha: "2026-10-16",
  precio: "762.69",
  cierre_anterior: "771.79",
  cambio: "-8.56",
  cambio_pct: "-1.1091",
  maximo: "773.25",
  minimo: "760.64",
  hora_dato: "2026-10-16T20:00:00Z",
  fuente: "cboe",
  url_dato: "https://cdn.cboe.com/api/global/delayed_quotes/quotes/SPY.json",
  recogido_en: "2026-10-16T20:25:00Z",
};
const GLD: CotizacionLista = {
  ...SPY,
  simbolo: "GLD",
  precio: "381.9",
  cierre_anterior: "382.71",
  cambio: "-0.7",
  cambio_pct: "-0.1829",
  maximo: "384.88",
  minimo: "380.9",
  url_dato: "https://cdn.cboe.com/api/global/delayed_quotes/quotes/GLD.json",
};
const SABADO = { ahora: new Date("2026-10-17T15:00:00Z"), fuentes };

describe("validarSimboloLista", () => {
  it("acepta símbolos de EE. UU. y los normaliza", () => {
    expect(validarSimboloLista(" aapl ")).toEqual({ simbolo: "AAPL" });
    expect(validarSimboloLista("brk.b")).toEqual({ simbolo: "BRK.B" });
    expect(validarSimboloLista("$voo")).toEqual({ simbolo: "VOO" });
  });

  it("rechaza con un mensaje que dice cómo arreglarlo", () => {
    expect(validarSimboloLista("")).toEqual({ error: expect.stringMatching(/por ejemplo AAPL/) });
    expect(validarSimboloLista("AAPL MSFT")).toEqual({ error: expect.stringMatching(/sin espacios/) });
    expect(validarSimboloLista("BTC1")).toEqual({ error: expect.stringMatching(/no llevan números/) });
    expect(validarSimboloLista("MICROSOFT")).toEqual({ error: expect.stringMatching(/de 1 a 6 letras/) });
    expect(validarSimboloLista("BRK-B")).toEqual({ error: expect.stringMatching(/BRK\.B/) });
  });
});

describe("vistaCotizacion", () => {
  it("cifras exactas, rango del día y cierre del viernes sin marcar viejo", () => {
    const v = vistaCotizacion(SPY, SABADO);
    expect(v).toMatchObject({
      precio: "762.69",
      cambio: "−8.56",
      cambioPct: "−1.11%",
      direccion: "baja",
      maximo: "773.25",
      minimo: "760.64",
      estado: "cerrado",
      etiquetaCierre: "cierre del vie 16 oct",
    });
    expect(v.posicionRango).toBeCloseTo(0.1626, 3);
    expect(v.sello).toMatchObject({ fuente: "Cboe · diferido 15 min", url: SPY.url_dato, desactualizado: false });
  });

  it("con la bolsa abierta y sin lectura nueva por más de 45 min: dato viejo", () => {
    const v = vistaCotizacion(SPY, { ahora: new Date("2026-10-19T14:45:00Z"), fuentes });
    expect(v.estado).toBe("desactualizado");
    expect(v.sello.desactualizado).toBe(true);
  });

  it("sin cambio de la fuente lo calcula con el cierre anterior; sin rango, no inventa", () => {
    const v = vistaCotizacion({ ...SPY, cambio: null, cambio_pct: null, maximo: null }, SABADO);
    expect(v.cambio).toBe("−9.10");
    expect(v.cambioPct).toBe("−1.18%");
    expect(v.posicionRango).toBeNull();
  });
});

describe("armarLista", () => {
  it("ordena, empareja cotizaciones y respeta la marca de «no publica»", () => {
    const filas = armarLista(
      [
        { simbolo: "GLD", nota: "", orden: 2 },
        { simbolo: "SPY", nota: "índice", orden: 1 },
        { simbolo: "ZZZZ", nota: "", orden: 3 },
        { simbolo: "QQQ", nota: "", orden: 4 },
      ],
      ultimaPorSimbolo([GLD, SPY, { ...SPY, fecha: "2026-10-15", precio: "1" }]),
      [{ simbolo: "ZZZZ", motivo: "Cboe no publica este símbolo", marcado_en: "2026-10-17T14:00:00Z" }],
      SABADO,
    );
    expect(filas.map((f) => [f.simbolo, f.cotizacion?.precio ?? null, f.sinCotizacion])).toEqual([
      ["SPY", "762.69", null],
      ["GLD", "381.90", null],
      ["ZZZZ", null, "Cboe no publica este símbolo"],
      ["QQQ", null, null],
    ]);
  });
});

describe("armarPosiciones", () => {
  it("valor, cambio del día y ganancia contra el costo, todo con big.js", () => {
    const r = armarPosiciones(
      [
        { id: "a", nombre: "SPDR S&P 500", simbolo: "SPY", cantidad: "10", precio: "700", actualizado_en: null },
        { id: "b", nombre: "SPDR Gold", simbolo: "GLD", cantidad: "4", precio: "350", actualizado_en: null },
        { id: "c", nombre: "Vanguard S&P 500", simbolo: "VOO", cantidad: "3", precio: "640.5", actualizado_en: null },
      ],
      ultimaPorSimbolo([SPY, GLD]),
      new Map([
        ["a", { costoTotal: new Big("6123.6") }],
        ["b", null],
        ["c", null],
      ]),
      [],
      SABADO,
    );
    expect(r.filas.map((f) => [f.simbolo, f.valor, f.dia, f.diaPct, f.ganancia, f.gananciaPct, f.origenPrecio])).toEqual([
      ["SPY", "7,626.90", "−85.60", "−1.11%", "+1,503.30", "+24.55%", "mercado"],
      ["GLD", "1,527.60", "−2.80", "−0.18%", null, null, "mercado"],
      ["VOO", "1,921.50", null, null, null, null, "manual"],
    ]);
    // 11,076.00 = 7,626.90 + 1,527.60 + 1,921.50; día −88.40 sobre 9,242.90 = −0.956…%
    expect(r).toMatchObject({ valor: "11,076.00", dia: "−88.40", diaPct: "−0.96%", ganancia: "+1,503.30", sinCambio: 1, sinCosto: 2, conPrecioManual: 1 });
  });

  it("sin cotizaciones: no hay total del día (no se inventa un cero)", () => {
    const r = armarPosiciones([{ id: "c", nombre: "X", simbolo: "VOO", cantidad: "3", precio: "640.5", actualizado_en: null }], new Map(), new Map(), [], SABADO);
    expect(r.dia).toBeNull();
    expect(r.diaPct).toBeNull();
    expect(r.ganancia).toBeNull();
  });

  it("cantidades sin ceros de más", () => {
    expect(cifraCantidad("10.000000")).toBe("10");
    expect(cifraCantidad("1250.125")).toBe("1,250.125");
    expect(cifraCantidad("0.5")).toBe("0.5");
  });
});

describe("contextoLista", () => {
  const base = { ahora: new Date("2026-10-16T20:20:00Z"), fuentes, fuentesConFallo: new Set(["cboe", "finnhub"]) };
  it("el fallo de Cboe sale de la tarea cotizaciones-lista, no de la de índices", () => {
    expect([...contextoLista(base, "ok").fuentesConFallo!]).toEqual(["finnhub"]);
    expect([...contextoLista(base, "parcial").fuentesConFallo!]).toEqual(["finnhub"]);
    expect([...contextoLista(base, "error").fuentesConFallo!].sort()).toEqual(["cboe", "finnhub"]);
    expect([...contextoLista({ ...base, fuentesConFallo: undefined }, null).fuentesConFallo!]).toEqual([]);
  });
});
