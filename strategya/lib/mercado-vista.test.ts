import { describe, expect, it } from "vitest";
import {
  armarItem,
  etiquetaCierre,
  porqueReciente,
  puntosDelDia,
  trazoSparkline,
  type FuenteMercado,
  type ObsMercado,
  type SerieMercado,
} from "./mercado-vista";

const serie = (id: string, extra: Partial<SerieMercado> = {}): SerieMercado => ({
  id,
  nombre: id,
  nombre_corto: id,
  categoria: "indice",
  unidad: "puntos",
  moneda: "USD",
  fuente_id: "fmp",
  frecuencia: "intradia",
  max_antiguedad_min: 120,
  orden: 1,
  sustituto_de: null,
  meta: { simbolo: "^GSPC", mercado: "us_acciones" },
  activa: true,
  ...extra,
});

const obs = (extra: Partial<ObsMercado> = {}): ObsMercado => ({
  serie_id: "IDX_SPX",
  valor: "7705.79",
  cambio: "-13.15",
  cambio_pct: "-0.17036",
  cambio_origen: "fuente",
  fecha_dato: "2026-10-16",
  hora_dato: "2026-10-16T20:05:00Z",
  recogido_en: "2026-10-16T20:05:02Z",
  url_dato: null,
  estado: "ok",
  fuente_id: "fmp",
  ...extra,
});

const fuentes = new Map<string, FuenteMercado>([["fmp", { id: "fmp", nombre: "Financial Modeling Prep", url: "https://site.financialmodelingprep.com/" }]]);

describe("armarItem", () => {
  it("formatea exacto con signo y flecha de dirección", () => {
    const i = armarItem(serie("IDX_SPX"), obs(), { ahora: new Date("2026-10-16T20:30:00Z"), fuentes });
    expect(i).toMatchObject({ valor: "7,705.79", cambio: "−13.15", cambioPct: "−0.17%", direccion: "baja", horaEsConsulta: true });
    expect(i.sello).toMatchObject({ fuente: "Financial Modeling Prep", url: "https://site.financialmodelingprep.com/", fechaDato: "2026-10-16" });
  });

  it("sábado: el cierre del viernes no se pinta desactualizado", () => {
    const i = armarItem(serie("IDX_SPX"), obs(), { ahora: new Date("2026-10-17T15:00:00Z"), fuentes });
    expect(i.estado).toBe("cerrado");
    expect(i.etiquetaCierre).toBe("cierre del vie 16 oct");
    expect(i.sello?.desactualizado).toBe(false);
  });

  it("lunes con el mercado abierto 3 h y sin dato nuevo: desactualizado", () => {
    const i = armarItem(serie("IDX_SPX"), obs(), { ahora: new Date("2026-10-19T16:45:00Z"), fuentes });
    expect(i.estado).toBe("desactualizado");
    expect(i.sello?.desactualizado).toBe(true);
  });

  it("tasas: cambio en puntos básicos y sin %", () => {
    const i = armarItem(
      serie("UST_10A", { categoria: "tasa", unidad: "%", frecuencia: "diaria", max_antiguedad_min: 5760, fuente_id: "tesoro_eeuu", meta: {} }),
      obs({ serie_id: "UST_10A", valor: "5.19", cambio: "-0.05", cambio_pct: "-0.95", hora_dato: null, fecha_dato: "2026-10-14", fuente_id: "tesoro_eeuu" }),
      { ahora: new Date("2026-10-15T12:00:00Z"), fuentes },
    );
    expect(i).toMatchObject({ valor: "5.19", cambio: "−5 pb", cambioPct: null, estado: "al_dia" });
  });

  it("sin observación: «sin datos»; serie inactiva: «no disponible»", () => {
    expect(armarItem(serie("IDX_SPX"), undefined, { ahora: new Date(), fuentes }).estado).toBe("sin_datos");
    expect(armarItem(serie("WTI", { activa: false }), undefined, { ahora: new Date(), fuentes }).estado).toBe("no_disponible");
  });

  it("EUR/USD con 4 decimales, BTC sin decimales", () => {
    const ahora = new Date("2026-10-15T15:00:00Z");
    const e = armarItem(serie("EURUSD", { meta: { mercado: "fx" } }), obs({ valor: "1.1219", cambio: "0.00624", hora_dato: "2026-10-15T14:58:00Z" }), { ahora, fuentes });
    expect(e).toMatchObject({ valor: "1.1219", cambio: "+0.0062" });
    const b = armarItem(serie("BTC", { meta: { mercado: "cripto" } }), obs({ valor: "81200", cambio: "-1177.31408", hora_dato: "2026-10-15T14:58:00Z" }), { ahora, fuentes });
    expect(b).toMatchObject({ valor: "81,200", cambio: "−1,177" });
  });
});

describe("apoyos", () => {
  it("etiqueta de cierre", () => {
    expect(etiquetaCierre("2026-10-16")).toBe("cierre del vie 16 oct");
  });

  it("porqué: solo de las últimas 24 h y el más reciente", () => {
    const ex = [
      { serie_id: "ORO", texto: "viejo", fuentes: [], fecha: "2026-10-13T12:00:00Z" },
      { serie_id: "ORO", texto: "nuevo", fuentes: [], fecha: "2026-10-15T11:00:00Z" },
      { serie_id: "ORO", texto: "medio", fuentes: [], fecha: "2026-10-15T09:00:00Z" },
    ];
    expect(porqueReciente(ex, "ORO", new Date("2026-10-15T12:00:00Z"))?.texto).toBe("nuevo");
    expect(porqueReciente(ex, "ORO", new Date("2026-10-17T12:00:00Z"))).toBeNull();
    expect(porqueReciente(ex, "PLATA", new Date("2026-10-15T12:00:00Z"))).toBeNull();
  });

  it("puntos del último día y trazo", () => {
    const p = [
      { serie_id: "ORO", valor: "4100", fecha_dato: "2026-10-14", hora_dato: "2026-10-14T15:00:00Z" },
      { serie_id: "ORO", valor: "4173.5", fecha_dato: "2026-10-15", hora_dato: "2026-10-15T15:00:00Z" },
      { serie_id: "ORO", valor: "4150", fecha_dato: "2026-10-15", hora_dato: "2026-10-15T14:00:00Z" },
    ];
    expect(puntosDelDia(p, "ORO").map((x) => x.valor)).toEqual(["4150", "4173.5"]);
    expect(trazoSparkline(["1", "2"], 100, 20)).toBe("M2.0,18.0 L98.0,2.0");
    expect(trazoSparkline(["1"], 100, 20)).toBeNull();
  });
});
