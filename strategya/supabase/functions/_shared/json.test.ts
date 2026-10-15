import { describe, expect, it } from "vitest";
import { aDecimal, jsonExacto } from "./json.ts";

describe("jsonExacto", () => {
  it("devuelve cada número con su texto original (respuesta real de FMP quote-short)", () => {
    const r = jsonExacto<{ symbol: string; price: string; change: string; volume: string }[]>(
      '[{"symbol":"^GSPC","price":7705.79,"change":-13.15,"volume":785287574}]',
    );
    expect(r).toEqual([{ symbol: "^GSPC", price: "7705.79", change: "-13.15", volume: "785287574" }]);
  });

  it("no pierde dígitos que un float perdería", () => {
    const r = jsonExacto<{ a: string }>('{"a":0.1000000000000000055511151231257827}');
    expect(r.a).toBe("0.1000000000000000055511151231257827");
  });

  it("deja intactos textos, booleanos y null", () => {
    expect(jsonExacto('{"t":"1.5","b":true,"n":null}')).toEqual({ t: "1.5", b: true, n: null });
  });
});

describe("aDecimal", () => {
  it("normaliza exponentes y signos", () => {
    expect(aDecimal("1e-7")).toBe("0.0000001");
    expect(aDecimal("2.5E3")).toBe("2500");
    expect(aDecimal("+4.10")).toBe("4.1");
    expect(aDecimal("-0")).toBe("0");
    expect(aDecimal("61.5396")).toBe("61.5396");
  });

  it("rechaza lo que no es número", () => {
    for (const v of [null, undefined, "", "N/A", "NaN", "Infinity", "1,5", "abc"]) expect(aDecimal(v)).toBeNull();
  });
});
