import { describe, expect, it } from "vitest";
import {
  agruparPorCategoria,
  agruparPorPais,
  conflictos,
  estadoIA,
  hoyRD,
  inicioMesRD,
  itemsCinco,
  porcentajeUsado,
  SIN_PAIS,
  type TitularGuardado,
  validarNota,
  validarUmbral,
} from "./alertas-ia";

describe("validarUmbral (big.js, sin float)", () => {
  it("acepta decimales exactos y separador de miles", () => {
    expect(validarUmbral("nivel_sobre", "63.50")).toEqual({ ok: true, valor: "63.5" });
    expect(validarUmbral("nivel_bajo", "4,000")).toEqual({ ok: true, valor: "4000" });
    expect(validarUmbral("nivel_sobre", "0.1")).toEqual({ ok: true, valor: "0.1" });
  });
  it("rechaza vacío, texto, negativos, cero y exponentes", () => {
    for (const malo of ["", "abc", "-1", "0", "1e3", "63,5.2.1"]) expect(validarUmbral("nivel_sobre", malo).ok).toBe(false);
  });
  it("cambio diario de más de 100 % no", () => expect(validarUmbral("cambio_pct_dia", "150").ok).toBe(false));
  it("cualquier_cambio no lleva umbral", () => expect(validarUmbral("cualquier_cambio", "x")).toEqual({ ok: true, valor: null }));
  it("nota: vacía es null y tiene largo máximo", () => {
    expect(validarNota("  ")).toEqual({ ok: true, valor: null });
    expect(validarNota("x".repeat(301)).ok).toBe(false);
  });
});

describe("fechas RD", () => {
  it("hoy y el inicio de mes en hora RD (UTC−4)", () => {
    const ahora = new Date("2026-11-01T02:00:00Z"); // 31 oct, 10:00 PM en RD
    expect(hoyRD(ahora)).toBe("2026-10-31");
    expect(inicioMesRD(ahora)).toBe("2026-10-01T04:00:00.000Z");
  });
});

describe("estadoIA", () => {
  const base = { estado: "parcial", detalle: null };
  it("sin corridas o sin clave: no activa", () => {
    expect(estadoIA([])).toEqual({ activa: false, motivo: "sin_corridas" });
    expect(estadoIA([{ ...base, tarea: "ia-porque", inicio: "2026-10-15T10:00:00Z", error: "Falta ANTHROPIC_API_KEY: x" }])).toEqual({
      activa: false,
      motivo: "sin_clave",
    });
  });
  it("tope alcanzado según la última corrida con tope", () => {
    const r = estadoIA([
      { tarea: "ia-porque", inicio: "2026-10-15T10:15:00Z", estado: "parcial", error: "Tope", detalle: { tope_usd: "10", tope_alcanzado: true } },
      { tarea: "ia-porque", inicio: "2026-10-15T10:00:00Z", estado: "ok", error: null, detalle: { tope_usd: "10", tope_alcanzado: false } },
      { tarea: "tesoro", inicio: "2026-10-15T11:00:00Z", estado: "ok", error: null, detalle: {} },
    ]);
    expect(r).toEqual({ activa: true, topeAlcanzado: true, tope: "10" });
  });
  it("porcentaje usado con tope", () => {
    expect(porcentajeUsado("2.5", "10")).toBe(25);
    expect(porcentajeUsado("12", "10")).toBe(100);
    expect(porcentajeUsado("1", null)).toBeNull();
  });
});

describe("titulares agrupados (sin texto inventado)", () => {
  const t = (id: number, pais: string | null, fecha: string, categoria = "guerra"): TitularGuardado => ({
    id, titular: `T${id}`, url: `https://e.org/${id}`, medio: "M", fecha, pais, categoria,
  });
  it("guerras por país, más reciente primero", () => {
    const g = agruparPorPais([t(1, "Ucrania", "2026-10-15T01:00:00Z"), t(2, null, "2026-10-15T03:00:00Z"), t(3, "Ucrania", "2026-10-15T02:00:00Z")]);
    expect(g.map((x) => [x.pais, x.titulares.map((y) => y.id)])).toEqual([[SIN_PAIS, [2]], ["Ucrania", [3, 1]]]);
  });
  it("por categoría con orden fijo", () => {
    const g = agruparPorCategoria([t(1, null, "2026-10-15T01:00:00Z", "rd"), t(2, null, "2026-10-15T02:00:00Z", "mercado")]);
    expect(g.map((x) => x.categoria)).toEqual(["mercado", "rd"]);
  });
});

describe("lectura de datos guardados", () => {
  it("descarta items sin forma", () => {
    expect(itemsCinco({ items: [{ titulo: "a", resumen: "b", porque: "c", y_que: "d", url: "u" }, { titulo: "x" }] })).toHaveLength(1);
    expect(itemsCinco(null)).toEqual([]);
    expect(conflictos({ conflictos: [{ conflicto: "a", pais: "", estado: "GUERRA", que_paso: "b", mercado: "c", url: "u" }] })).toEqual([]);
  });
});
