import Big from "big.js";
import { describe, expect, it } from "vitest";
import { hallazgos } from "./alertas";
import { activosEjemplo, cierreEjemplo, contextoEjemplo, parametrosEjemplo } from "./apoyo-pruebas";
import { cambioDelMes, fotoViva, indicadores, sumIngresos, usoTarjetas } from "./cierres";
import { mesPrevio, mesSiguiente, mesesEntre } from "./fechas";
import { pb, pct, rd, sg } from "./formato";
import { escenarios, proyectar, sensibilidad } from "./futuro";
import { impactoDia } from "./impacto";
import { armarFx, posicion, precioDe, valorDOP } from "./posicion";
import { costoDe, retornoPosiciones, serieRetorno, tirGlobal, twr, xirr } from "./retorno";
import { duracionModificada, puente, rebalanceo, riesgo } from "./riesgo";
import type { Foto } from "./tipos";

const foto = (patrimonio: string, fecha: string, usd: string | null = "60"): Foto => ({
  activos: patrimonio,
  pasivos: "0",
  patrimonio,
  liquidos: "0",
  ingresoPasivoAnual: "0",
  fecha,
  fx: { USD: usd, EUR: null },
});

describe("posición y tipo de cambio", () => {
  it("valora cada activo en RD$ con big.js y suma por clase, moneda y emisor", () => {
    const ctx = contextoEjemplo();
    const pos = posicion(ctx);
    // 10,000 + 50,000 + 500×60 + 100,000 + 10×100×60
    expect(pos.total.toFixed()).toBe("250000");
    expect(pos.liquidos.toFixed()).toBe("90000");
    expect(pos.extranjero.toFixed()).toBe("90000");
    expect(pos.porEmisor["Banco A"].toFixed()).toBe("80000");
    expect(pos.rentaTotal.toFixed()).toBe("12500"); // 50,000×5% + 100,000×10%
    expect(pos.sinValorar).toEqual([]);
  });

  it("usa el último USDDOP_VENTA del BCRD si existe y dice cuál usó", () => {
    const { fx, anteriorUSD } = armarFx(
      [
        { valor: "62.10", fecha_dato: "2026-10-13", recogido_en: null, url_dato: null },
        { valor: "62.35", fecha_dato: "2026-10-14", recogido_en: "2026-10-14T13:00:00Z", url_dato: "https://bcrd/x" },
      ],
      parametrosEjemplo(),
    );
    expect(fx.USD).toMatchObject({ origen: "bcrd", fecha: "2026-10-14", url: "https://bcrd/x" });
    expect(fx.USD.valor!.toFixed()).toBe("62.35");
    expect(anteriorUSD).toEqual({ valor: new Big("62.10"), fecha: "2026-10-13" });
    // € (Núcleo v2): ya no se usa el manual; sin el EUR/USD del BCE de la misma fecha queda «no confirmado».
    expect(fx.EUR).toMatchObject({ origen: "ninguno", valor: null });
  });

  it("sin serie ni tipo manual, la moneda queda sin valorar en vez de valer 1", () => {
    const p = { ...parametrosEjemplo(), fx: { USD: "60", EUR: null } };
    const ctx = contextoEjemplo({
      p,
      activos: [...activosEjemplo(), { id: "e1", clase: "efectivo", nombre: "Euros", inst: "", simbolo: null, moneda: "EUR", cantidad: "100", precio: "1", tasa: "0", venc: null, tipoRF: null }],
    });
    expect(valorDOP(ctx, ctx.activos.at(-1)!)).toBeNull();
    expect(posicion(ctx).sinValorar.map((a) => a.id)).toEqual(["e1"]);
    expect(posicion(ctx).total.toFixed()).toBe("250000");
  });

  it("prefiere el precio de mercado del símbolo; sin cotización usa el manual", () => {
    const ctx = contextoEjemplo({
      precios: { XXX: { simbolo: "XXX", precio: "110.5", fecha: "2026-10-14", anterior: "100", horaDato: null, recogidoEn: null, url: null, fuente: "finnhub" } },
    });
    const accion = ctx.activos.find((a) => a.id === "a5")!;
    expect(precioDe(ctx, accion)).toMatchObject({ origen: "mercado" });
    expect(valorDOP(ctx, accion)!.toFixed()).toBe("66300");
    expect(precioDe(contextoEjemplo(), accion)).toMatchObject({ origen: "manual" });
  });
});

describe("cierres e indicadores", () => {
  it("suma solo las partidas vigentes del presupuesto y calcula las razones del mes", () => {
    const ctx = contextoEjemplo({ cierres: { "2026-10": cierreEjemplo({ ingresos: { "in-1": "50000", "borrada": "999" } }) } });
    const ind = indicadores(ctx, "2026-10");
    expect(ind.ing.toFixed()).toBe("50000");
    expect(ind.gOp.toFixed()).toBe("25000");
    expect(ind.flujo.toFixed()).toBe("25000");
    expect(ind.tasaAhorro!.toFixed()).toBe("0.5");
    expect(ind.fondoMeses!.toFixed()).toBe("3.6"); // 90,000 / 25,000
    expect(ind.efectivoResidual.toFixed()).toBe("15000");
    expect(ind.patLibertad!.toFixed()).toBe("7500000"); // 25,000×12 / 4%
    expect(ind.foto.vivo).toBe(true);
    expect(usoTarjetas(ctx.p, ctx.cierres["2026-10"]).pct!.toFixed()).toBe("0.4");
  });

  it("un mes agregado usa sus totales; sin gasto el fondo de emergencia es «sin datos», no 0", () => {
    const p = parametrosEjemplo();
    const agregado = { ...cierreEjemplo(), agregado: true, totIngresos: "40000.50", totFijos: "1", totVariables: "2", totAportes: "3" };
    expect(sumIngresos(p, agregado).toFixed()).toBe("40000.5");
    const ctx = contextoEjemplo();
    expect(indicadores(ctx, "2026-10").fondoMeses).toBeNull();
  });

  it("cambio del mes contra la última foto congelada", () => {
    const ctx = contextoEjemplo({ cierres: { "2026-09": cierreEjemplo({ snap: foto("200000", "2026-09-30"), cerrado: true }) } });
    const c = cambioDelMes(ctx, "2026-10")!;
    expect(c.previo).toBe("2026-09");
    expect(c.cambio.toFixed()).toBe("50000");
    expect(c.pct!.toFixed()).toBe("0.25");
  });

  it("la foto viva resta los pasivos del cierre", () => {
    const ctx = contextoEjemplo({ cierres: { "2026-10": cierreEjemplo({ deudas: { tc: "5000", prestamos: null, otras: "1000" } }) } });
    expect(fotoViva(ctx, "2026-10").patrimonio.toFixed()).toBe("244000");
  });
});

describe("retorno", () => {
  const cierres = {
    "2026-08": cierreEjemplo({ snap: foto("100000", "2026-08-31"), cerrado: true }),
    "2026-09": cierreEjemplo({ snap: foto("112000", "2026-09-30"), cerrado: true, ingresos: { "in-1": "35000" } }),
  };

  it("TWR con aporte a mitad de período (Dietz modificado)", () => {
    const ctx = contextoEjemplo({ cierres });
    expect(serieRetorno(ctx).map((p) => p.C.toFixed())).toEqual(["0", "10000"]);
    const t = twr(ctx)!;
    // (112,000 − 100,000 − 10,000) / (100,000 + 5,000)
    expect(t.total.toFixed(10)).toBe("0.0190476190");
    expect(t.meses).toBe(1);
    expect(t.anualizado).toBeCloseTo(Math.pow(1 + 2000 / 105000, 12) - 1, 10);
  });

  it("menos de dos fotos: no hay retorno (no se inventa)", () => {
    expect(twr(contextoEjemplo())).toBeNull();
    expect(tirGlobal(contextoEjemplo())).toBeNull();
  });

  it("XIRR: 1,000 que se vuelven 1,100 en un año rinden ~10 %", () => {
    expect(xirr([{ f: "2025-01-01", v: -1000 }, { f: "2026-01-01", v: 1100 }])!).toBeCloseTo(0.1, 3);
    expect(xirr([{ f: "2025-01-01", v: -1000 }])).toBeNull();
    expect(xirr([{ f: "2025-01-01", v: 1000 }, { f: "2026-01-01", v: 1100 }])).toBeNull();
  });

  it("TIR del patrimonio con los flujos de los cierres", () => {
    const r = tirGlobal(contextoEjemplo({ cierres }))!;
    expect(r.flujos).toBe(3);
    expect(r.tir).toBeGreaterThan(0);
  });

  it("base de costo promedio, P&L realizado y cobrado", () => {
    const tx = [
      { id: "t1", activoId: "a5", simbolo: "XXX", tipo: "compra", fecha: "2026-01-10", cantidad: "10", precio: "100", comision: "5", moneda: "USD" },
      { id: "t2", activoId: "a5", simbolo: "XXX", tipo: "compra", fecha: "2026-02-10", cantidad: "10", precio: "120", comision: "0", moneda: "USD" },
      { id: "t3", activoId: "a5", simbolo: "XXX", tipo: "venta", fecha: "2026-03-10", cantidad: "5", precio: "130", comision: "2", moneda: "USD" },
      { id: "t4", activoId: "a5", simbolo: "XXX", tipo: "dividendo", fecha: "2026-04-10", cantidad: "1", precio: "30", comision: "0", moneda: "USD" },
    ] as const;
    const ctx = contextoEjemplo({ tx: tx.map((t) => ({ ...t })) });
    const c = costoDe(ctx, "a5")!;
    expect(c.cantidad.toFixed()).toBe("15");
    expect(c.costoTotal.toFixed()).toBe("1653.75");
    expect(c.costoProm.toFixed()).toBe("110.25");
    expect(c.realizado.toFixed()).toBe("96.75");
    expect(c.cobrado.toFixed()).toBe("30");
    const [r] = retornoPosiciones(ctx);
    expect(r.noRealizado.toFixed()).toBe("-653.75"); // 10 acciones × 100 manual − costo
    expect(r.totalPL.toFixed()).toBe("-527");
    expect(costoDe(ctx, "a1")).toBeNull();
  });
});

describe("riesgo", () => {
  it("duración: acumula = plazo/(1+y); cupón con la fórmula del artefacto", () => {
    const a = activosEjemplo().find((x) => x.id === "a4")!;
    const plazo = 365 / 365.25;
    expect(duracionModificada(a, "2026-10-15")).toBeCloseTo(plazo / 1.1, 10);
    const cupon = { ...a, tipoRF: "cupon" as const };
    expect(duracionModificada(cupon, "2026-10-15")).toBeCloseTo(((1.1 / 0.1) * (1 - Math.pow(1.1, -plazo))) / 1.1, 10);
    expect(duracionModificada({ ...a, venc: "2026-01-01" }, "2026-10-15")).toBe(0);
    expect(duracionModificada(activosEjemplo()[0], "2026-10-15")).toBeNull();
  });

  it("concentración, escalera y sensibilidad cambiaria", () => {
    const rk = riesgo(contextoEjemplo());
    expect(rk.maxEmisor!.nombre).toBe("Banco B");
    expect(rk.maxEmisor!.pct!.toFixed()).toBe("0.4");
    expect(rk.escalera["2027"].toFixed()).toBe("100000");
    expect(rk.sinVenc.toFixed()).toBe("0");
    expect(rk.fxSens.map((s) => s.impacto.toFixed())).toEqual(["4500", "9000"]);
    expect(rk.sensRF100!.lt(0)).toBe(true);
  });

  it("rebalanceo descriptivo con banda", () => {
    const filas = rebalanceo(contextoEjemplo());
    const rf = filas.find((f) => f.id === "rentafija")!;
    expect(rf.pctA.toFixed()).toBe("0.4");
    expect(rf.estado).toBe("bajo meta");
    expect(rf.dif.toFixed()).toBe("25000");
    expect(filas.find((f) => f.id === "rentavariable")!.estado).toBe("bajo meta"); // 24 % contra 30 %
    expect(filas.find((f) => f.id === "ahorros")!.estado).toBe("sobre meta"); // 32 % contra 10 %
  });

  it("puente: ahorro + rendimiento + efecto cambiario + sin explicar", () => {
    const cierres = {
      "2026-09": cierreEjemplo({ snap: foto("200000", "2026-09-30", "58"), cerrado: true }),
      "2026-10": cierreEjemplo({ snap: { ...foto("250000", "2026-10-15", "60"), activos: "250000", ingresoPasivoAnual: "12500" }, cerrado: true }),
    };
    const pu = puente(contextoEjemplo({ cierres }), "2026-10")!;
    expect(pu.meses).toBe(1);
    expect(pu.flujo.toFixed()).toBe("25000");
    // US$ en cartera: 500 + 10×100 = 1,500 × (60 − 58)
    expect(pu.efectoFX.toFixed()).toBe("3000");
    expect(pu.fxMedible).toBe(true);
    const esperado = new Big(50000).minus(25000).minus(3000).minus(pu.rend);
    expect(pu.sinExplicar.toFixed()).toBe(esperado.toFixed());
    expect(pu.alerta).toBe(esperado.abs().gt(4000));
  });
});

describe("futuro", () => {
  it("sin retorno ni inflación, la proyección es el inicial más los aportes", () => {
    const ctx = contextoEjemplo();
    const p = proyectar(ctx, { horizonte: new Big(1), retorno: new Big(0), inflacion: new Big(0), deprecFX: new Big(0), aporte: new Big(1000), incrAporte: new Big(0) });
    expect(p.meses).toBe(12);
    expect(p.final.toFixed()).toBe("262000");
    expect(p.finalReal.toFixed()).toBe("262000");
    expect(p.rendimiento.toFixed()).toBe("0");
  });

  it("con retorno, el resultado coincide con la fórmula cerrada (a 1 centavo)", () => {
    const ctx = contextoEjemplo({ activos: [] });
    const p = proyectar(ctx, { V0: new Big(100000), horizonte: new Big(2), retorno: new Big("0.12"), inflacion: new Big(0), deprecFX: new Big(0), aporte: new Big(0), incrAporte: new Big(0) });
    expect(Number(p.final.toFixed(2))).toBeCloseTo(100000 * 1.12 * 1.12, 1);
  });

  it("escenarios y sensibilidad ordenada por rango", () => {
    const ctx = contextoEjemplo();
    expect(escenarios(ctx).map((e) => e.id)).toEqual(["estres", "base"]);
    const s = sensibilidad(ctx);
    expect(s).toHaveLength(4);
    for (let i = 1; i < s.length; i++) expect(s[i - 1].rango.gte(s[i].rango)).toBe(true);
    expect(s.find((x) => x.id === "aporte")!.alto.gt(0)).toBe(true);
    expect(s.find((x) => x.id === "inflacion")!.alto.lt(0)).toBe(true);
    expect(sensibilidad(contextoEjemplo({ p: { ...parametrosEjemplo(), escenarios: [] } }))).toEqual([]);
  });
});

describe("impacto del día", () => {
  it("separa efecto precio y efecto cambiario", () => {
    const ctx = contextoEjemplo({
      usd: [
        { valor: "60", fecha_dato: "2026-10-13", recogido_en: null, url_dato: null },
        { valor: "61", fecha_dato: "2026-10-14", recogido_en: null, url_dato: null },
      ],
      precios: { XXX: { simbolo: "XXX", precio: "105", fecha: "2026-10-14", anterior: "100", horaDato: null, recogidoEn: null, url: null, fuente: "finnhub" } },
    });
    const im = impactoDia(ctx)!;
    // precio: 10 × (105 − 100) × 60 = 3,000 · fx: (500 + 10×105) × (61 − 60) = 1,550
    expect(im.efPrecio.toFixed()).toBe("3000");
    expect(im.efFX.toFixed()).toBe("1550");
    expect(im.fecha).toBe("2026-10-14");
    expect(im.comparable).toBe(true);
  });

  it("sin datos de mercado no hay impacto", () => {
    expect(impactoDia(contextoEjemplo())).toBeNull();
  });
});

describe("hallazgos", () => {
  it("reporta vencimientos, metas y falta de cierre sin recomendar operaciones", () => {
    const activos = activosEjemplo().map((a) => (a.id === "a4" ? { ...a, venc: "2026-11-30" } : a));
    const A = hallazgos(contextoEjemplo({ activos, cierres: { "2026-10": cierreEjemplo() } }), "2026-10");
    const titulos = A.map((a) => a.t);
    expect(titulos).toContain("Certificado vence en 46 días");
    expect(titulos.some((t) => t.startsWith("Fondo de emergencia: 3.6 meses"))).toBe(true);
    expect(titulos).toContain("Falta cerrar Octubre 2026");
    expect(titulos).toContain("Sin libro de transacciones");
    const todo = JSON.stringify(A).toLowerCase();
    for (const palabra of ["comprar", "vender", "recomend", "deberías", "renegoci", "diversific"]) expect(todo).not.toContain(palabra);
  });
});

describe("fechas y formato", () => {
  it("meses", () => {
    expect(mesPrevio("2026-01")).toBe("2025-12");
    expect(mesSiguiente("2026-12")).toBe("2027-01");
    expect(mesesEntre("2025-11", "2026-02")).toBe(3);
  });
  it("formato con signo tipográfico", () => {
    expect(rd(new Big("-1234.5"), 2)).toBe("RD$ −1,234.50");
    expect(pct(new Big("0.0455"), 1)).toBe("4.6%");
    expect(pct(null)).toBe("—");
    expect(pb(new Big("-0.0125"))).toBe("−125 pb");
    expect(sg(new Big("3000"))).toBe("+3,000");
  });
});
