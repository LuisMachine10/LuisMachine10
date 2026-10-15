import { describe, expect, it } from "vitest";
import { armarCurva, fechaComparacion, type ObservacionCurva, type SerieCurva } from "./curva";
import { cifra, cifraConSigno, direccion, fechaCorta, hace, horaRD, puntosBasicos } from "./formato";
import { frescura } from "./frescura";

describe("formato de cifras (exacto, desde texto)", () => {
  it("miles con coma, decimales con punto, redondeo mitad hacia arriba", () => {
    expect(cifra("4107.9", 2)).toBe("4,107.90");
    expect(cifra("61.5396", 2)).toBe("61.54");
    expect(cifra("0.125", 2)).toBe("0.13");
    expect(cifra("1234567.891", 0)).toBe("1,234,568");
    expect(cifra("-7721.494", 2)).toBe("−7,721.49");
  });

  it("no pierde precisión donde float sí la perdería", () => {
    expect(cifra("0.285", 2)).toBe("0.29"); // en float, 0.285.toFixed(2) === "0.28"
    expect(cifra("1.005", 2)).toBe("1.01");
  });

  it("signo visible y cero sin signo", () => {
    expect(cifraConSigno("0.05", 2)).toBe("+0.05");
    expect(cifraConSigno("-0.05", 2)).toBe("−0.05");
    expect(cifraConSigno("0", 2)).toBe("0.00");
    expect(cifraConSigno("-0.001", 2)).toBe("0.00");
  });

  it("cambio de tasa en puntos básicos", () => {
    expect(puntosBasicos("-0.05")).toBe("−5 pb");
    expect(puntosBasicos("0.12")).toBe("+12 pb");
    expect(puntosBasicos("0")).toBe("0 pb");
  });

  it("dirección del cambio", () => {
    expect(direccion("0.01")).toBe("sube");
    expect(direccion("-0.01")).toBe("baja");
    expect(direccion("0")).toBe("igual");
    expect(direccion(null)).toBe("igual");
  });
});

describe("fechas y horas en RD", () => {
  it("la fecha del dato no se corre de día por la zona horaria", () => {
    expect(fechaCorta("2026-10-14")).toBe("14 oct 2026");
    expect(fechaCorta("2026-10-01", false)).toBe("1 oct");
  });

  it("hora RD (UTC−4)", () => {
    expect(horaRD("2026-10-15T22:15:00Z")).toMatch(/^6:15\sp\.\s?m\.$/);
  });

  it("hace X", () => {
    const ahora = new Date("2026-10-15T12:00:00Z");
    expect(hace("2026-10-15T11:59:40Z", ahora)).toBe("hace instantes");
    expect(hace("2026-10-15T11:48:00Z", ahora)).toBe("hace 12 min");
    expect(hace("2026-10-15T08:55:00Z", ahora)).toBe("hace 3 h 5 min");
    expect(hace("2026-10-15T09:00:00Z", ahora)).toBe("hace 3 h");
    expect(hace("2026-10-13T09:00:00Z", ahora)).toBe("hace 2 d");
  });
});

describe("frescura", () => {
  const cuatroDias = 5760;
  it("el dato diario del viernes sigue al día el lunes en la mañana", () => {
    const f = frescura({ fecha_dato: "2026-10-09" }, cuatroDias, new Date("2026-10-12T11:00:00Z"));
    expect(f.desactualizado).toBe(false);
  });
  it("pasa a desactualizado después de su antigüedad máxima", () => {
    const f = frescura({ fecha_dato: "2026-10-09" }, cuatroDias, new Date("2026-10-14T01:00:00Z"));
    expect(f.desactualizado).toBe(true);
  });
  it("con hora exacta mide desde esa hora (cotizaciones)", () => {
    const f = frescura({ fecha_dato: "2026-10-15", hora_dato: "2026-10-15T14:00:00Z" }, 15, new Date("2026-10-15T14:20:00Z"));
    expect(f).toEqual({ desactualizado: true, minutos: 20 });
  });
});

describe("armarCurva", () => {
  const series: SerieCurva[] = [
    { id: "UST_2A", nombre: "Tesoro EE. UU. 2 años", nombre_corto: "2A", orden: 2, max_antiguedad_min: 5760 },
    { id: "UST_1M", nombre: "Tesoro EE. UU. 1 mes", nombre_corto: "1M", orden: 1, max_antiguedad_min: 5760 },
    { id: "UST_10A", nombre: "Tesoro EE. UU. 10 años", nombre_corto: "10A", orden: 3, max_antiguedad_min: 5760 },
  ];
  const o = (serie_id: string, fecha_dato: string, valor: string, cambio: string | null = null): ObservacionCurva => ({
    serie_id, fecha_dato, valor, cambio, recogido_en: `${fecha_dato}T22:20:00Z`, url_dato: "https://home.treasury.gov/x", estado: "ok",
  });

  it("toma la última fecha, ordena por plazo y empareja con la comparación de ~1 mes", () => {
    const c = armarCurva(series, [
      o("UST_1M", "2026-09-14", "4.00"), o("UST_2A", "2026-09-14", "4.70"), o("UST_10A", "2026-09-14", "5.00"),
      o("UST_1M", "2026-10-14", "4.11", "0.01"), o("UST_2A", "2026-10-14", "4.82", "-0.02"), o("UST_10A", "2026-10-14", "5.19", "-0.05"),
    ])!;
    expect(c.fecha).toBe("2026-10-14");
    expect(c.fechaComparacion).toBe("2026-09-14");
    expect(c.puntos.map((p) => [p.plazo, p.valor, p.valorComparacion])).toEqual([
      ["1M", "4.11", "4.00"], ["2A", "4.82", "4.70"], ["10A", "5.19", "5.00"],
    ]);
    expect(c.faltantes).toEqual([]);
  });

  it("no rellena un plazo que la fuente no publicó: lo lista como faltante", () => {
    const c = armarCurva(series, [o("UST_1M", "2026-10-14", "4.11"), o("UST_10A", "2026-10-14", "5.19")])!;
    expect(c.puntos.map((p) => p.plazo)).toEqual(["1M", "10A"]);
    expect(c.faltantes).toEqual(["2A"]);
    expect(c.fechaComparacion).toBeNull();
    expect(c.puntos[0].valorComparacion).toBeNull();
  });

  it("sin datos devuelve null (la pantalla dice «sin datos», no inventa)", () => {
    expect(armarCurva(series, [])).toBeNull();
  });

  it("fecha de comparación: la más reciente a 30 días o más", () => {
    expect(fechaComparacion(["2026-09-12", "2026-09-15", "2026-10-14"], "2026-10-14", 30)).toBe("2026-09-12");
    expect(fechaComparacion(["2026-10-13"], "2026-10-14", 30)).toBeNull();
  });
});
