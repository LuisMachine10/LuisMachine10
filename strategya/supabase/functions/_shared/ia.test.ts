import { describe, expect, it } from "vitest";
import {
  calcularCosto,
  CAUSA_NO_CONFIRMADA,
  contarOraciones,
  contextoDe,
  cuerpoPedido,
  ESQUEMA_PORQUE,
  interpretarRespuesta,
  lecturasNumero,
  leerTope,
  numerosAjenos,
  numerosPermitidos,
  validarCinco,
  validarGuerras,
  validarPorque,
} from "./ia.ts";
import { respuestaSintetica } from "../../../pruebas/apoyo/anthropic-sintetica.ts";

describe("calcularCosto", () => {
  it("Haiku 5.5: US$0.10 / 0.50 por millón", () => {
    expect(calcularCosto("claude-haiku-5-5", { input_tokens: 1200, output_tokens: 150 })).toBe("0.000195");
  });
  it("Sonnet 5.5: US$2 / 10 por millón", () => {
    expect(calcularCosto("claude-sonnet-5-5", { input_tokens: 5000, output_tokens: 3000 })).toBe("0.040000");
  });
  it("Haiku por encima de 100K tokens de entrada usa la tarifa larga", () => {
    expect(calcularCosto("claude-haiku-5-5", { input_tokens: 200_000, output_tokens: 0 })).toBe("0.100000");
  });
  it("redondea hacia arriba (nunca subestima el gasto)", () => {
    expect(calcularCosto("claude-haiku-5-5", { input_tokens: 1, output_tokens: 0 })).toBe("0.000001");
  });
  it("modelo sin tarifa: error (no se gasta sin medir)", () => {
    expect(() => calcularCosto("otro", { input_tokens: 1, output_tokens: 1 })).toThrow(/Sin tarifa/);
  });
});

describe("leerTope", () => {
  it("por defecto US$10", () => expect(leerTope(undefined)).toEqual({ tope: "10" }));
  it("lee un decimal exacto", () => expect(leerTope("12.50")).toEqual({ tope: "12.5" }));
  it("inválido: vuelve a 10 y avisa", () => expect(leerTope("diez").advertencia).toMatch(/inválido/));
});

describe("interpretarRespuesta", () => {
  it("toma el texto, ignora el bloque thinking y calcula el costo", () => {
    const r = interpretarRespuesta(respuestaSintetica('{"explicado":false,"texto":"","fuentes":[]}'), "claude-haiku-5-5");
    expect(r).toMatchObject({ ok: true, costo: "0.000195", json: { explicado: false } });
  });
  it("refusal y max_tokens: no confirmado, pero el costo se cuenta", () => {
    const r = interpretarRespuesta(respuestaSintetica("", { stop_reason: "refusal" }), "claude-haiku-5-5");
    expect(r).toMatchObject({ ok: false, costo: "0.000195" });
    expect(interpretarRespuesta(respuestaSintetica("{", { stop_reason: "max_tokens" }), "claude-haiku-5-5").ok).toBe(false);
  });
  it("texto que no es JSON", () => {
    expect(interpretarRespuesta(respuestaSintetica("Hola"), "claude-haiku-5-5")).toMatchObject({ ok: false, motivo: /JSON/ });
  });
  it("un número JSON en la salida llega como texto exacto", () => {
    const r = interpretarRespuesta(respuestaSintetica('{"a":0.285}'), "claude-haiku-5-5");
    expect(r.ok && (r.json as { a: unknown }).a).toBe("0.285");
  });
});

describe("cuerpoPedido", () => {
  it("formato de la Messages API con JSON estricto", () => {
    const c = cuerpoPedido({ modelo: "claude-haiku-5-5", sistema: "s", mensaje: "m", esquema: ESQUEMA_PORQUE, maxTokens: 2000, esfuerzo: "low" });
    expect(c).toEqual({
      model: "claude-haiku-5-5",
      max_tokens: 2000,
      system: "s",
      messages: [{ role: "user", content: "m" }],
      output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_PORQUE } },
    });
  });
});

describe("números: ninguno inventado", () => {
  const entrada = "- Oro [ORO] · valor 4312.5 US$/oz · cambio 98.1 · cambio % 2.3456 · fecha 2026-10-15";
  const permitidos = numerosPermitidos(entrada);

  it("lee miles con coma y decimal con coma", () => {
    expect(lecturasNumero("4,312.50")).toContain("4312.5");
    expect(lecturasNumero("2,35")).toContain("2.35");
  });
  it("acepta las cifras de la entrada, con formato y redondeo", () => {
    expect(numerosAjenos("El oro subió 2.35 % hasta 4,312.50 dólares el 15 de octubre de 2026.", permitidos)).toEqual([]);
    expect(numerosAjenos("Subió 2,3 %.", permitidos)).toEqual([]);
  });
  it("rechaza una cifra que no está en los datos", () => {
    expect(numerosAjenos("El oro tocó 4,400 dólares, su máximo en 3 meses.", permitidos)).toEqual(["4,400", "3"]);
  });
});

describe("validaciones de salida", () => {
  const titulares = [
    { titular: "Gold jumps as Fed signals pause", url: "https://ejemplo.org/oro" },
    { titular: "Ceasefire talks stall", url: "https://ejemplo.org/tregua" },
  ];
  const mensaje = "- Oro · valor 4312.5 · cambio % 2.35 · fecha 2026-10-15";
  const ctx = contextoDe(mensaje, titulares);

  it("porqué válido: toma el titular guardado como título de la fuente", () => {
    const v = validarPorque({ explicado: true, texto: "El oro subió 2.35 % tras señales de pausa de la Fed.", fuentes: [{ url: "https://ejemplo.org/oro" }] }, ctx);
    expect(v).toEqual({
      ok: true,
      valor: {
        explicado: true,
        texto: "El oro subió 2.35 % tras señales de pausa de la Fed.",
        fuentes: [{ titulo: "Gold jumps as Fed signals pause", url: "https://ejemplo.org/oro" }],
      },
    });
  });
  it("explicado=false → causa no confirmada", () => {
    expect(validarPorque({ explicado: false, texto: "", fuentes: [] }, ctx)).toEqual({
      ok: true,
      valor: { explicado: false, texto: CAUSA_NO_CONFIRMADA, fuentes: [] },
    });
  });
  it("rechaza enlaces ajenos, cifras inventadas, claves extra y recomendaciones", () => {
    const base = { explicado: true, texto: "Subió por la Fed.", fuentes: [{ url: "https://ejemplo.org/oro" }] };
    expect(validarPorque({ ...base, fuentes: [{ url: "https://otro.com/x" }] }, ctx)).toMatchObject({ ok: false, motivo: /enlace/ });
    expect(validarPorque({ ...base, texto: "Subió 5 % por la Fed." }, ctx)).toMatchObject({ ok: false, motivo: /cifras/ });
    expect(validarPorque({ ...base, extra: 1 }, ctx)).toMatchObject({ ok: false, motivo: /estructura/ });
    expect(validarPorque({ ...base, texto: "Buen momento: compre oro." }, ctx)).toMatchObject({ ok: false, motivo: /recomendación/ });
    expect(validarPorque({ ...base, texto: "Una. Dos. Tres." }, ctx)).toMatchObject({ ok: false, motivo: /oraciones/ });
    expect(validarPorque({ ...base, texto: "Ver https://ejemplo.org/oro" }, ctx)).toMatchObject({ ok: false });
  });
  it("«EE. UU.» no cuenta como fin de oración", () => {
    expect(contarOraciones("La Fed de EE. UU. pausó. El oro subió.")).toBe(2);
  });

  it("Las 5 del día: estructura exacta y enlaces únicos", () => {
    const item = { titulo: "La Fed pausa", resumen: "La Fed señaló una pausa. El oro reaccionó.", porque: "Baja el costo de oportunidad.", y_que: "El dólar pesa en RD.", url: "https://ejemplo.org/oro" };
    expect(validarCinco({ items: [item] }, ctx)).toMatchObject({ ok: true });
    expect(validarCinco({ items: [item, item] }, ctx)).toMatchObject({ ok: false, motivo: /repetido/ });
    expect(validarCinco({ items: [] }, ctx)).toMatchObject({ ok: false });
    expect(validarCinco({ items: [{ ...item, url: "https://x.y" }] }, ctx)).toMatchObject({ ok: false });
  });

  it("Guerras: estado dentro de la lista", () => {
    const c = { conflicto: "Conversaciones de tregua", pais: "Ucrania", estado: "TENSIÓN", que_paso: "Las conversaciones se estancaron.", mercado: "El petróleo lo mira de cerca.", url: "https://ejemplo.org/tregua" };
    expect(validarGuerras({ conflictos: [c] }, ctx)).toMatchObject({ ok: true });
    expect(validarGuerras({ conflictos: [] }, ctx)).toMatchObject({ ok: true, valor: [] });
    expect(validarGuerras({ conflictos: [{ ...c, estado: "GUERRA" }] }, ctx)).toMatchObject({ ok: false, motivo: /estado/ });
  });
});
