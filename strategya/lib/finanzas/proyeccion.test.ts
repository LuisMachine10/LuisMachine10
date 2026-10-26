// Manual, secciones A y C: proyecciones con aportes EN MONTO y las reglas de cada tipo de instrumento.
// Cifras de los ejemplos del manual (redondas, de nadie).
import { describe, expect, it } from "vitest";
import { contextoEjemplo } from "../capital/apoyo-pruebas";
import { Big, CERO } from "../capital/decimal";
import { cuantoDejaAlMes, proyectarInstrumento, proyectarPortafolio, reglasDe } from "../capital/proyeccion";
import { type Activo, planVacio } from "../capital/tipos";
import { estadoMutuo, renovar } from "./mutuo";

const HOY = "2026-10-15";
const activo = (x: Partial<Activo> & Pick<Activo, "id" | "tipo">): Activo => ({
  clase: "rentafija",
  nombre: x.id,
  inst: "",
  simbolo: null,
  moneda: "DOP",
  cantidad: "100000",
  precio: "1",
  tasa: "0.10",
  venc: null,
  tipoRF: null,
  plan: planVacio(),
  ...x,
});
const a2 = (b: Big) => b.round(2, Big.roundHalfUp).toFixed(2);
const fin = <T>(xs: T[]) => xs[xs.length - 1];

describe("los tres ejemplos del manual", () => {
  it("10,000 al mes durante 12 meses al 10 % capitalizable mensual, aporte al final del mes = 125,655.68", () => {
    const r = reglasDe(activo({ id: "ar", tipo: "alto_rendimiento", clase: "ahorros", cantidad: "0" }), new Big(10000), HOY);
    expect(r.capitaliza).toBe(true);
    expect(a2(fin(proyectarInstrumento(CERO, r, 12)).saldo)).toBe("125655.68");
  });

  it("100,000 al 10 % capitalizable mensual durante 1 año = 110,471.31", () => {
    const r = reglasDe(activo({ id: "cd", tipo: "certificado", plan: { ...planVacio(), capitaliza: true }, retencion: "0" }), CERO, HOY);
    expect(a2(fin(proyectarInstrumento(new Big(100000), r, 12)).saldo)).toBe("110471.31");
  });

  it("simple: 100,000 al 10 % un año = 10,000 de interés; 9,000 neto con la retención de 10 % del certificado", () => {
    const cd = activo({ id: "cd", tipo: "certificado", plan: { ...planVacio(), capitaliza: false, frecuenciaPago: "mensual" } });
    const r = reglasDe(cd, CERO, HOY);
    expect(r.retencion!.toFixed()).toBe("0.1");
    const p = fin(proyectarInstrumento(new Big(100000), r, 12));
    expect(a2(p.bruto)).toBe("10000.00");
    expect(a2(p.cobrado)).toBe("9000.00");
    expect(a2(p.retenido)).toBe("1000.00");
    expect(p.saldo.toFixed()).toBe("100000");
  });
});

describe("reglas por tipo en la proyección", () => {
  it("cuenta de ahorro: su interés mínimo no se cuenta (tasa 0)", () => {
    const r = reglasDe(activo({ id: "ah", tipo: "ahorro", clase: "ahorros", tasa: "0.02" }), CERO, HOY);
    expect(r.tasa.toFixed()).toBe("0");
  });

  it("efectivo y cuenta corriente no rinden", () => {
    expect(reglasDe(activo({ id: "e", tipo: "efectivo", clase: "efectivo", tasa: "0.05" }), CERO, HOY).tasa.toFixed()).toBe("0");
    expect(reglasDe(activo({ id: "c", tipo: "corriente", clase: "ahorros", tasa: "0.01" }), CERO, HOY).tasa.toFixed()).toBe("0");
  });

  it("alto rendimiento: «cuánto te deja al mes» = saldo × tasa ÷ 12", () => {
    expect(cuantoDejaAlMes(activo({ id: "ar", tipo: "alto_rendimiento", clase: "ahorros", cantidad: "120000", tasa: "0.06" }))!.toFixed(2)).toBe("600.00");
    expect(cuantoDejaAlMes(activo({ id: "ah", tipo: "ahorro", clase: "ahorros", cantidad: "120000", tasa: "0.06" }))).toBeNull();
  });

  it("certificado ELEGIBLE sin elegir: no se supone; su interés no se proyecta y se pide elegir", () => {
    const r = reglasDe(activo({ id: "cd", tipo: "certificado" }), CERO, HOY);
    expect(r.sinElegir).toBe(true);
    expect(fin(proyectarInstrumento(new Big(100000), r, 12)).interes.toFixed()).toBe("0");
  });

  it("certificado elegido: capitalizable crece adentro; con pago a una cuenta, el interés se cobra y el capital no cambia", () => {
    const capitaliza = reglasDe(activo({ id: "a", tipo: "certificado", plan: { ...planVacio(), capitaliza: true } }), CERO, HOY);
    const paga = reglasDe(activo({ id: "b", tipo: "certificado", plan: { ...planVacio(), capitaliza: false } }), CERO, HOY);
    expect(fin(proyectarInstrumento(new Big(100000), capitaliza, 12)).saldo.gt(100000)).toBe(true);
    const p = fin(proyectarInstrumento(new Big(100000), paga, 12));
    expect(p.saldo.toFixed()).toBe("100000");
    expect(p.cobrado.gt(0)).toBe(true);
  });

  it("bono: el cupón se cobra en una cuenta (no capitaliza); sin frecuencia escrita se dice que es supuesta", () => {
    const r = reglasDe(activo({ id: "bn", tipo: "bono" }), CERO, HOY);
    expect(r).toMatchObject({ capitaliza: false, reinvierte: false, supuesto: true });
    expect(reglasDe(activo({ id: "bn", tipo: "bono", plan: { ...planVacio(), capitaliza: false, frecuenciaPago: "semestral" } }), CERO, HOY)).toMatchObject({ cadaMeses: 6, supuesto: false });
  });

  it("acción/ETF: dividendo a una cuenta, no capitaliza", () => {
    expect(reglasDe(activo({ id: "x", tipo: "accion_etf", clase: "rentavariable", tasa: "0.02" }), CERO, HOY)).toMatchObject({ capitaliza: false, reinvierte: false });
  });

  it("fondo abierto: capitaliza implícito en el valor cuota", () => {
    expect(reglasDe(activo({ id: "f", tipo: "fondo_abierto" }), CERO, HOY).capitaliza).toBe(true);
  });

  it("puesto de bolsa sin comisión anotada: «no confirmado» (no se descuenta nada inventado); con comisión anotada, se descuenta", () => {
    const sin = reglasDe(activo({ id: "f", tipo: "fondo_abierto" }), CERO, HOY);
    expect(sin.comisionNoConfirmada).toBe(true);
    const con = reglasDe(activo({ id: "f", tipo: "fondo_abierto", comisionAdmin: "0.012" }), CERO, HOY);
    expect(con.comisionNoConfirmada).toBe(false);
    const a = fin(proyectarInstrumento(new Big(100000), sin, 12));
    const b = fin(proyectarInstrumento(new Big(100000), con, 12));
    expect(b.comisiones.gt(0)).toBe(true);
    expect(b.saldo.lt(a.saldo)).toBe(true);
  });

  it("al vencer, el certificado deja de ganar y de recibir aportes (no se supone renovación)", () => {
    const r = reglasDe(activo({ id: "cd", tipo: "certificado", venc: "2027-01-15", plan: { ...planVacio(), capitaliza: true } }), new Big(1000), HOY);
    const pts = proyectarInstrumento(new Big(100000), r, 12);
    expect(pts[12].saldo.toFixed()).toBe(pts[3].saldo.toFixed());
  });
});

describe("mutuo / reporto: renovaciones manuales", () => {
  it("cada renovación: capital nuevo = anterior + interés dejado + aporte; el interés retirado va a una cuenta", () => {
    const r1 = renovar("100000", { fecha: "2026-09-01", plazoDias: 30, tasa: "0.09", interes: "750", dejaInteres: true, aporte: "5000" });
    expect(r1.capitalNuevo).toBe("105750");
    const r2 = renovar(r1.capitalNuevo, { fecha: "2026-10-01", plazoDias: 30, tasa: "0.085", interes: "749.06", dejaInteres: false, aporte: "0" });
    expect(r2.capitalNuevo).toBe("105750");
    const e = estadoMutuo("100000", [r1, r2]);
    expect(e).toMatchObject({ capital: "105750", tasa: "0.085", vence: "2026-10-31", interesDejado: "750", interesRetirado: "749.06", aportes: "5000", renovaciones: 2, dejaInteres: false });
  });

  it("no capitaliza solo: sin plan ni renovaciones, el interés no se suma al capital", () => {
    const r = reglasDe(activo({ id: "m", tipo: "mutuo", plazoDias: 30 }), CERO, HOY);
    expect(r).toMatchObject({ capitaliza: false, reinvierte: false, cadaMeses: 1, origenReinversion: "no_capitaliza_solo" });
    expect(fin(proyectarInstrumento(new Big(100000), r, 12)).saldo.toFixed()).toBe("100000");
  });

  it("si en su última renovación dejó el interés, la proyección hace lo mismo (interés compuesto hecho por él)", () => {
    const r1 = renovar("100000", { fecha: "2026-10-01", plazoDias: 30, tasa: "0.12", interes: "1000", dejaInteres: true, aporte: "0" });
    const r = reglasDe(activo({ id: "m", tipo: "mutuo", plazoDias: 30, renovaciones: [r1], cantidad: "101000", tasa: "0.12" }), CERO, HOY);
    expect(r).toMatchObject({ reinvierte: true, origenReinversion: "ultima_renovacion" });
    expect(fin(proyectarInstrumento(new Big(101000), r, 2)).saldo.toFixed()).toBe("103030.1");
  });

  it("plazo de 90 días: se renueva cada 3 meses", () => {
    expect(reglasDe(activo({ id: "m", tipo: "mutuo", plazoDias: 90 }), CERO, HOY).cadaMeses).toBe(3);
  });
});

describe("proyección del portafolio con los aportes EXACTOS del plan del mes", () => {
  it("cada instrumento recibe solo el monto de su línea; la Política no reparte nada", () => {
    const ctx = contextoEjemplo();
    // a4 = certificado de 100,000 (vence oct. 2027); a2 = ahorro. Solo a2 tiene línea: 2,000 al mes.
    const p = proyectarPortafolio(ctx, 6, new Map([["a2", { monto: new Big(2000), moneda: "DOP" }]]));
    const de = (id: string) => p.porInstrumento.find((x) => x.activo.id === id)!;
    expect(de("a2").aporte.toFixed()).toBe("2000");
    expect(de("a4").aporte.toFixed()).toBe("0");
    expect(de("a1").aporte.toFixed()).toBe("0");
    expect(p.ahorroMensual!.toFixed()).toBe("2000");
    expect(p.puntos[6].aportado.minus(p.puntos[0].aportado).toFixed()).toBe("12000");
  });

  it("una línea en US$ se pasa a RD$ con el tipo de cambio del Portafolio", () => {
    const p = proyectarPortafolio(contextoEjemplo(), 1, new Map([["a3", { monto: new Big(100), moneda: "USD" }]]));
    expect(p.porInstrumento.find((x) => x.activo.id === "a3")!.aporte.toFixed()).toBe("6000");
  });

  it("sin líneas no hay aportes (no se inventan) y una línea a algo que no está en el Portafolio se avisa", () => {
    const p = proyectarPortafolio(contextoEjemplo(), 3);
    expect(p.ahorroMensual).toBeNull();
    expect(proyectarPortafolio(contextoEjemplo(), 3, new Map([["nada", { monto: new Big(1), moneda: "DOP" }]])).aportesSinDestino).toEqual(["nada"]);
  });

  it("una línea que empieza más adelante entra desde su mes y una con fin deja de entrar", () => {
    const p = proyectarPortafolio(contextoEjemplo(), 6, new Map([["a2", { monto: new Big(1000), moneda: "DOP", desdeMes: 3, hastaMes: 4 }]]));
    const a = p.porInstrumento.find((x) => x.activo.id === "a2")!.pts.map((x) => x.aportado.toFixed());
    expect(a).toEqual(["50000", "50000", "50000", "51000", "52000", "52000", "52000"]);
  });
});
