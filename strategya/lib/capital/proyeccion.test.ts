// Motor de proyección con aportes del Presupuesto. Cifras SINTÉTICAS redondas para revisar a mano.
import { describe, expect, it } from "vitest";
import { activosEjemplo, contextoEjemplo, parametrosEjemplo } from "./apoyo-pruebas";
import { Big, CERO } from "./decimal";
import { aportesDelPlan, horizonteMeses, proyectarInstrumento, proyectarPortafolio, type Reglas, reglasDe, repartoClases } from "./proyeccion";
import { planVacio } from "./tipos";

const base = (r: Partial<Reglas> = {}): Reglas => ({ tasa: new Big("0.12"), capitaliza: true, cadaMeses: 1, reinvierte: false, aporte: CERO, desdeMes: 1, vence: null, supuesto: false, ...r });
const fin = (pts: ReturnType<typeof proyectarInstrumento>) => pts[pts.length - 1];

describe("interés compuesto de un instrumento", () => {
  it("capitalizable: 12 % al año = 1 % cada mes sobre el saldo que crece", () => {
    const pts = proyectarInstrumento(new Big(100000), base(), 2);
    expect(pts[1].saldo.toFixed()).toBe("101000");
    expect(pts[2].saldo.toFixed()).toBe("102010"); // interés sobre interés
    expect(pts[2].interes.toFixed()).toBe("2010");
    expect(pts[2].aportado.toFixed()).toBe("100000");
  });

  it("no capitalizable sin reinvertir: el interés se cobra y no crece", () => {
    const pts = proyectarInstrumento(new Big(100000), base({ capitaliza: false, cadaMeses: 1 }), 3);
    expect(fin(pts).saldo.toFixed()).toBe("100000");
    expect(fin(pts).cobrado.toFixed()).toBe("3000");
    expect(fin(pts).interes.toFixed()).toBe("3000");
  });

  it("no capitalizable reinvirtiendo cada mes (estrategia de reinvertir): igual al capitalizable", () => {
    const a = proyectarInstrumento(new Big(100000), base({ capitaliza: false, cadaMeses: 1, reinvierte: true }), 12);
    const b = proyectarInstrumento(new Big(100000), base(), 12);
    expect(fin(a).saldo.toFixed()).toBe(fin(b).saldo.toFixed());
  });

  it("paga cada 3 meses: el interés se junta y se reinvierte al trimestre", () => {
    const pts = proyectarInstrumento(new Big(100000), base({ capitaliza: false, cadaMeses: 3, reinvierte: true }), 6);
    expect(pts[2].saldo.toFixed()).toBe("102000"); // 2 meses devengados, aún sin pagar
    expect(pts[3].saldo.toFixed()).toBe("103000");
    expect(pts[6].saldo.toFixed()).toBe("106090"); // el 2.º trimestre gana sobre 103,000
  });

  it("aportes: entran al final del mes y ganan desde el siguiente", () => {
    const pts = proyectarInstrumento(new Big(0), base({ aporte: new Big(1000) }), 2);
    expect(pts[1].saldo.toFixed()).toBe("1000");
    expect(pts[2].saldo.toFixed()).toBe("2010");
    expect(pts[2].aportado.toFixed()).toBe("2000");
    expect(pts[2].interes.toFixed()).toBe("10");
  });

  it("aportes desde una fecha de inicio", () => {
    const pts = proyectarInstrumento(new Big(0), base({ tasa: CERO, aporte: new Big(500), desdeMes: 3 }), 4);
    expect(pts.map((p) => p.saldo.toFixed())).toEqual(["0", "0", "0", "500", "1000"]);
  });

  it("vencimiento: paga lo pendiente, deja de ganar y de recibir aportes", () => {
    const pts = proyectarInstrumento(new Big(100000), base({ capitaliza: false, cadaMeses: 0, aporte: new Big(1000), vence: 3 }), 6);
    expect(pts[2].saldo.toFixed()).toBe("104010"); // 102,000 de capital + 2,010 de interés aún sin pagar
    expect(pts[3].cobrado.gt(0)).toBe(true); // al vencer cobra todo el interés
    expect(pts[6].saldo.toFixed()).toBe(pts[3].saldo.toFixed());
    expect(pts[6].aportado.toFixed()).toBe("102000"); // el mes del vencimiento ya no entra aporte
  });
});

describe("reglas por defecto y del plan", () => {
  it("cupón sin plan: no capitaliza, paga cada mes; con plan, manda lo que escribió Mena", () => {
    const cupon = { ...activosEjemplo()[3], tipoRF: "cupon" as const, plan: planVacio() };
    expect(reglasDe(cupon, CERO, "2026-10-15")).toMatchObject({ capitaliza: false, cadaMeses: 1, supuesto: true, vence: 12 });
    const conPlan = { ...cupon, plan: { ...planVacio(), capitaliza: false, frecuenciaPago: "semestral" as const, reinvierte: true } };
    expect(reglasDe(conPlan, CERO, "2026-10-15")).toMatchObject({ capitaliza: false, cadaMeses: 6, reinvierte: true, supuesto: false });
  });
});

describe("reparto del ahorro presupuestado (por clase y por instrumento)", () => {
  it("usa la meta de la política si no hay plan; dentro de la clase, partes iguales o lo escrito", () => {
    const ctx = contextoEjemplo();
    expect(repartoClases(ctx)!.origen).toBe("meta");
    const ap = aportesDelPlan(ctx, new Big(10000));
    // Meta: efectivo 10 %, ahorros 10 % (2 cuentas → 500 c/u), renta fija 50 %, renta variable 30 %.
    expect(ap.map((x) => [x.activo.id, x.monto.toFixed()])).toEqual([["a1", "1000"], ["a2", "500"], ["a3", "500"], ["a4", "5000"], ["a5", "3000"]]);
    const activos = activosEjemplo().map((a) => (a.id === "a2" ? { ...a, plan: { ...planVacio(), aportePct: "1" } } : a));
    const ap2 = aportesDelPlan(contextoEjemplo({ activos, p: { ...parametrosEjemplo(), planClases: { efectivo: "0", ahorros: "1", rentafija: "0", rentavariable: "0" } } }), new Big(10000));
    expect(ap2.map((x) => [x.activo.id, x.monto.toFixed()])).toEqual([["a2", "10000"], ["a3", "0"]]);
  });

  it("proyección total: lo aportado + lo que ganaron los intereses = total, mes a mes", () => {
    const ctx = contextoEjemplo();
    const p = proyectarPortafolio(ctx, 24, new Big(10000));
    const ult = p.puntos[24];
    expect(ult.total.toFixed()).toBe(ult.aportado.plus(ult.interes).toFixed());
    // 24 × 10,000, menos los 13 aportes de 5,000 del certificado que vence en oct. 2027 (deja de recibir).
    expect(ult.aportado.minus(p.puntos[0].aportado).toFixed()).toBe("175000");
    expect(p.puntos[0].interes.toFixed()).toBe("0");
    expect(horizonteMeses(ctx, "5")).toBe(60);
  });
});
