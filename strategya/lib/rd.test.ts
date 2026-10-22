import { describe, expect, it } from "vitest";
import {
  brechaCambiaria,
  cruceEuro,
  filtrarFondos,
  fondosPorSafi,
  fondosVista,
  historial,
  mesCorto,
  mesLargo,
  type ObsRD,
  semanaVigencia,
  type SerieRD,
  SERIES_TASAS,
  ultimosDatos,
  validarDecimal,
  validarEnlace,
  validarFecha,
  type FilaFondo,
} from "./rd";

const serie = (id: string, max = 5760): SerieRD => ({
  id, nombre: id, nombre_corto: id, unidad: "RD$ por US$", frecuencia: "diaria", max_antiguedad_min: max, fuente_id: "bcrd", orden: 1,
});
const obs = (serie_id: string, fecha_dato: string, valor: string, extra: Partial<ObsRD> = {}): ObsRD => ({
  serie_id, fecha_dato, valor, cambio: null, recogido_en: "2026-10-15T13:00:00Z", url_dato: null, fuente_id: "bcrd", ...extra,
});
const FUENTES = [
  { id: "bcrd", nombre: "Banco Central RD · portada", url: "https://www.bancentral.gov.do/" },
  { id: "manual", nombre: "Carga manual de Mena", url: "https://strategya.local/carga" },
];

describe("ultimosDatos", () => {
  const ahora = new Date("2026-10-15T15:00:00Z");
  const datos = ultimosDatos(
    [serie("USDDOP_VENTA"), serie("TASA_BOJ", 525600), serie("SIN_DATOS")],
    [
      obs("USDDOP_VENTA", "2026-10-13", "61.5396"),
      obs("USDDOP_VENTA", "2026-10-14", "61.6788", { cambio: "0.1392" }),
      obs("TASA_BOJ", "2026-09-19", "0.75", { fuente_id: "manual", url_dato: "https://www.boj.or.jp/" }),
    ],
    FUENTES,
    ahora,
  );

  it("toma el último dato y el anterior, sin importar el orden de llegada", () => {
    expect(datos.get("USDDOP_VENTA")?.obs.valor).toBe("61.6788");
    expect(datos.get("USDDOP_VENTA")?.anterior?.valor).toBe("61.5396");
    expect(datos.get("USDDOP_VENTA")?.desactualizado).toBe(false);
  });

  it("la fuente es la de la observación: un dato manual se rotula como manual", () => {
    expect(datos.get("TASA_BOJ")?.fuente.id).toBe("manual");
  });

  it("una serie sin observaciones no aparece (la pantalla dice «sin datos»)", () => {
    expect(datos.has("SIN_DATOS")).toBe(false);
  });

  it("marca desactualizado según la fecha del dato", () => {
    const viejo = ultimosDatos([serie("USDDOP_VENTA")], [obs("USDDOP_VENTA", "2026-10-01", "60")], FUENTES, ahora);
    expect(viejo.get("USDDOP_VENTA")?.desactualizado).toBe(true);
  });

  it("historial reciente del más nuevo al más viejo", () => {
    const h = historial([obs("A", "2026-10-01", "1"), obs("A", "2026-10-03", "3"), obs("B", "2026-10-04", "9"), obs("A", "2026-10-02", "2")], "A", 2);
    expect(h.map((o) => o.valor)).toEqual(["3", "2"]);
  });
});

describe("formatos de fecha del módulo", () => {
  it("mes de un dato mensual", () => {
    expect(mesLargo("2026-08-31")).toBe("agosto 2026");
    expect(mesCorto("2026-09-30")).toBe("sep 2026");
  });

  it("semana de vigencia de combustibles", () => {
    expect(semanaVigencia("2026-10-10")).toBe("10–16 oct 2026");
    expect(semanaVigencia("2026-10-31")).toBe("31 oct – 6 nov 2026");
    expect(semanaVigencia("2026-12-26")).toBe("26 dic 2026 – 1 ene 2027");
  });
});

describe("brechaCambiaria", () => {
  it("venta − compra del mismo día, exacta", () => {
    expect(brechaCambiaria(obs("USDDOP_COMPRA", "2026-10-14", "61.1477"), obs("USDDOP_VENTA", "2026-10-14", "61.6788"))).toBe("0.5311");
  });
  it("si los días no coinciden no se calcula", () => {
    expect(brechaCambiaria(obs("USDDOP_COMPRA", "2026-10-13", "61.1149"), obs("USDDOP_VENTA", "2026-10-14", "61.6788"))).toBeNull();
    expect(brechaCambiaria(undefined, undefined)).toBeNull();
  });
});

describe("fondosPorSafi", () => {
  const f = (id: number, safi: string, fondo: string, fecha_corte: string, rendimiento: string, plazo_dias = 30): FilaFondo => ({
    id, safi, fondo, moneda: "DOP", plazo_dias, rendimiento, fecha_corte, url_fuente: "https://x.do", nota: null,
  });

  it("deja el último corte de cada fondo y agrupa por SAFI", () => {
    const g = fondosPorSafi([
      f(1, "SAFI B", "Liquidez", "2026-10-01", "6.10"),
      f(2, "SAFI B", "Liquidez", "2026-10-14", "6.25"),
      f(3, "SAFI A", "Renta fija", "2026-10-10", "7.00", 365),
      f(4, "SAFI B", "Liquidez", "2026-10-14", "6.40", 365),
    ]);
    expect(g.map((x) => x.safi)).toEqual(["SAFI A", "SAFI B"]);
    expect(g[1].fondos.map((x) => [x.rendimiento, x.plazo_dias])).toEqual([["6.25", 30], ["6.40", 365]]);
    expect(g[1].ultimoCorte).toBe("2026-10-14");
  });
});

describe("validación de la carga manual", () => {
  it("decimales con punto, sin comas ni notación científica", () => {
    expect(validarDecimal("5.25", "El valor")).toEqual({ ok: true, valor: "5.25" });
    expect(validarDecimal(" 1525.40 ", "El valor")).toEqual({ ok: true, valor: "1525.40" });
    expect(validarDecimal("1,525.40", "El valor")).toMatchObject({ ok: false, error: expect.stringMatching(/sin comas/) });
    expect(validarDecimal("1e3", "El valor")).toMatchObject({ ok: false });
    expect(validarDecimal("", "el valor")).toEqual({ ok: false, error: "Falta el valor." });
    expect(validarDecimal("0", "El monto", { positivo: true })).toMatchObject({ ok: false });
  });

  it("fechas reales AAAA-MM-DD", () => {
    expect(validarFecha("2026-10-14", "Fecha")).toEqual({ ok: true, valor: "2026-10-14" });
    expect(validarFecha("2026-02-30", "Fecha")).toMatchObject({ ok: false, error: "Fecha: la fecha no existe." });
    expect(validarFecha("14/10/2026", "Fecha")).toMatchObject({ ok: false });
  });

  it("enlace obligatorio con http(s)", () => {
    expect(validarEnlace("https://www.boj.or.jp/en/")).toEqual({ ok: true, valor: "https://www.boj.or.jp/en/" });
    expect(validarEnlace("")).toMatchObject({ ok: false });
    expect(validarEnlace("javascript:alert(1)")).toMatchObject({ ok: false });
  });

  it("el boletín cubre 21 series de tasas", () => {
    expect(SERIES_TASAS).toHaveLength(21);
  });
});

describe("cruceEuro (dólar del BCRD × euro del BCE)", () => {
  // Cifras de las muestras reales: TASA_DOLAR_REFERENCIA_MC.xlsx (14 oct 2026) y eurofxref-daily (16 oct 2026).
  const dolar = [
    obs("USDDOP_VENTA", "2026-10-13", "61.5396"),
    obs("USDDOP_COMPRA", "2026-10-13", "61.1149"),
    obs("USDDOP_VENTA", "2026-10-14", "61.6788"),
    obs("USDDOP_COMPRA", "2026-10-14", "61.1477"),
  ];
  const eur = (fecha: string, valor: string) => obs("EURUSD", fecha, valor, { fuente_id: "bce_fx" });

  it("multiplica exacto, a 4 decimales, con el último dólar publicado en o antes de la fecha del BCE", () => {
    expect(cruceEuro(dolar, [eur("2026-10-16", "1.1253")])).toEqual([
      { fecha: "2026-10-16", fechaDolar: "2026-10-14", eurusd: "1.1253", venta: "69.4072", compra: "68.8095" },
    ]);
  });

  it("no cruza si el dólar es de más de 3 días antes ni si no hay dólar previo", () => {
    expect(cruceEuro(dolar, [eur("2026-10-20", "1.1300")])).toEqual([]);
    expect(cruceEuro(dolar, [eur("2026-10-10", "1.1300")])).toEqual([]);
  });

  it("del más nuevo al más viejo, una tasa por fecha", () => {
    const r = cruceEuro(dolar, [eur("2026-10-13", "1.1000"), eur("2026-10-14", "1.1000"), eur("2026-10-14", "1.2000")]);
    expect(r.map((p) => [p.fecha, p.fechaDolar, p.venta])).toEqual([
      ["2026-10-14", "2026-10-14", "67.8467"],
      ["2026-10-13", "2026-10-13", "67.6936"],
    ]);
  });
});

describe("fondosVista y filtrarFondos", () => {
  const ahora = new Date("2026-10-20T16:00:00Z");
  const f = (id: number, safi: string, fondo: string, moneda: "DOP" | "USD", plazo_dias: number, rendimiento: string, fecha_corte: string, extra: Partial<FilaFondo> = {}): FilaFondo => ({
    id, safi, fondo, moneda, plazo_dias, rendimiento, fecha_corte, url_fuente: `https://x.do/${id}`, nota: null, origen: "automatica", ...extra,
  });
  const filas = [
    f(1, "Excel", "Liquidez", "DOP", 30, "7.10", "2026-10-04", { valor_cuota: "1234.5678" }),
    f(2, "Excel", "Liquidez", "DOP", 365, "8.20", "2026-10-04", { valor_cuota: "1234.5678" }),
    f(3, "Excel", "Liquidez", "DOP", 90, "7.50", "2026-10-04"),
    f(4, "Excel", "Liquidez", "DOP", 30, "6.90", "2026-09-27"),
    f(5, "Reservas", "Caoba", "DOP", 30, "9.05", "2026-10-18"),
    f(6, "Reservas", "Larimar", "USD", 360, "4.10", "2026-10-18", { origen: "manual" }),
  ];

  it("solo 30 días y 1 año (360 o 365), último corte, con valor cuota y «Dato viejo» a los 10 días", () => {
    const v = fondosVista(filas, ahora);
    expect(v.map((x) => [x.safi, x.fondo, x.moneda, x.r30?.rendimiento ?? null, x.r1a?.rendimiento ?? null, x.viejo])).toEqual([
      ["Excel", "Liquidez", "DOP", "7.10", "8.20", true],
      ["Reservas", "Caoba", "DOP", "9.05", null, false],
      ["Reservas", "Larimar", "USD", null, "4.10", false],
    ]);
    expect(v[0].valorCuota).toEqual({ valor: "1234.5678", fecha_corte: "2026-10-04" });
    expect(v[0].r1a?.plazo_dias).toBe(365);
    expect(v[2].r1a?.plazo_dias).toBe(360);
    expect(v[2].manual).toBe(true);
  });

  it("filtra por SAFI y moneda, y ordena por el rendimiento del periodo elegido (sin dato, al final)", () => {
    const v = fondosVista(filas, ahora);
    const nombres = (l: typeof v) => l.map((x) => x.fondo);
    expect(nombres(filtrarFondos(v, { safi: "", moneda: "", periodo: "ambos", orden: "mayor" }))).toEqual(["Caoba", "Liquidez", "Larimar"]);
    expect(nombres(filtrarFondos(v, { safi: "", moneda: "", periodo: "ambos", orden: "menor" }))).toEqual(["Liquidez", "Caoba", "Larimar"]);
    expect(nombres(filtrarFondos(v, { safi: "", moneda: "", periodo: "30", orden: "mayor" }))).toEqual(["Caoba", "Liquidez"]);
    expect(nombres(filtrarFondos(v, { safi: "", moneda: "", periodo: "1a", orden: "mayor" }))).toEqual(["Liquidez", "Larimar"]);
    expect(nombres(filtrarFondos(v, { safi: "Reservas", moneda: "", periodo: "ambos", orden: "nombre" }))).toEqual(["Caoba", "Larimar"]);
    expect(nombres(filtrarFondos(v, { safi: "", moneda: "USD", periodo: "ambos", orden: "mayor" }))).toEqual(["Larimar"]);
  });
});
