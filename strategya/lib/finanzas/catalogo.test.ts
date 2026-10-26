// Manual de lógica financiera (docs/manual-financiero.md), secciones A y B: una prueba por regla del catálogo y
// por fila de las listas (tabla de verdad tipo × formulario). Sin cifras de nadie.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  aparece,
  CATALOGO,
  capitalizaDe,
  claseDeTipo,
  cuentasPara,
  errorDeCuentas,
  esInversionFin,
  FORMULARIOS,
  pagaACuenta,
  puedeRecibirCobros,
  retencionDe,
  ROLES,
  seEnlazaSola,
  tablaDeVerdad,
  tasaQueCuenta,
  TIPOS_FIN,
  type TipoFin,
  tipoInicial,
} from "./catalogo";

const INVERSIONES: TipoFin[] = ["certificado", "mutuo", "bono", "fondo_abierto", "fondo_cerrado", "accion_etf", "fideicomiso"];
const fila = (tipo: TipoFin, debito = false) => ({ tipo, debito });
const lista = (formulario: (typeof FORMULARIOS)[number], rol: "cuenta" | "origen" | "destino", debito = false) =>
  TIPOS_FIN.filter((t) => aparece(fila(t, debito), formulario, rol));

describe("A · catálogo de tipos: cada tipo con su regla del manual", () => {
  // La tabla del manual, fila por fila: cómo rinde, si capitaliza, si paga y si es destino de ahorro.
  const MANUAL: Record<TipoFin, { capitaliza: string; paga: boolean | "debito"; destino: boolean }> = {
    efectivo: { capitaliza: "no_rinde", paga: true, destino: true },
    corriente: { capitaliza: "no_rinde", paga: true, destino: false },
    ahorro: { capitaliza: "no", paga: true, destino: true },
    alto_rendimiento: { capitaliza: "si", paga: "debito", destino: true },
    certificado: { capitaliza: "elegible", paga: false, destino: true },
    mutuo: { capitaliza: "renovacion", paga: false, destino: true },
    bono: { capitaliza: "no", paga: false, destino: true },
    fondo_abierto: { capitaliza: "implicito", paga: false, destino: true },
    fondo_cerrado: { capitaliza: "elegible", paga: false, destino: true },
    accion_etf: { capitaliza: "no", paga: false, destino: true },
    fideicomiso: { capitaliza: "elegible", paga: false, destino: true },
    tarjeta: { capitaliza: "no_rinde", paga: true, destino: false },
    prestamo: { capitaliza: "no_rinde", paga: false, destino: false },
    otra_deuda: { capitaliza: "no_rinde", paga: false, destino: false },
    bien: { capitaliza: "no_rinde", paga: false, destino: false },
  };
  for (const t of TIPOS_FIN) {
    it(`${CATALOGO[t].nom}: capitaliza «${MANUAL[t].capitaliza}», paga ${String(MANUAL[t].paga)}, destino de ahorro ${MANUAL[t].destino ? "sí" : "no"}`, () => {
      expect(CATALOGO[t].capitaliza).toBe(MANUAL[t].capitaliza);
      expect(CATALOGO[t].paga).toBe(MANUAL[t].paga);
      expect(CATALOGO[t].destinoAhorro).toBe(MANUAL[t].destino);
    });
  }

  it("efectivo no rinde; cuenta corriente no paga interés; bienes no rinden (tasa que cuenta = 0)", () => {
    expect(tasaQueCuenta("efectivo", "0.05")).toBe("0");
    expect(tasaQueCuenta("corriente", "0.01")).toBe("0");
    expect(tasaQueCuenta("bien", "0.1")).toBe("0");
  });

  it("cuenta de ahorro: el interés mínimo POR AHORA NO SE CUENTA (tasa 0) aunque tenga tasa escrita", () => {
    expect(tasaQueCuenta("ahorro", "0.0025")).toBe("0");
    expect(capitalizaDe("ahorro", true)).toBe(false);
  });

  it("alto rendimiento: tasa anotada y el interés entra a la misma cuenta (capitaliza)", () => {
    expect(tasaQueCuenta("alto_rendimiento", "0.065")).toBe("0.065");
    expect(capitalizaDe("alto_rendimiento", null)).toBe(true);
    expect(pagaACuenta("alto_rendimiento", true)).toBe(false);
  });

  it("alto rendimiento solo sale en «¿Con qué pagaste?» si tiene tarjeta de débito", () => {
    expect(aparece(fila("alto_rendimiento", false), "pago", "cuenta")).toBe(false);
    expect(aparece(fila("alto_rendimiento", true), "pago", "cuenta")).toBe(true);
  });

  it("certificado: capitaliza o paga intereses a una cuenta, ELEGIBLE por certificado (sin elegir = null, no se supone)", () => {
    expect(capitalizaDe("certificado", null)).toBeNull();
    expect(capitalizaDe("certificado", true)).toBe(true);
    expect(capitalizaDe("certificado", false)).toBe(false);
    expect(pagaACuenta("certificado", false)).toBe(true);
    expect(pagaACuenta("certificado", true)).toBe(false);
  });

  it("mutuo/reporto: NO capitaliza solo (se renueva a mano)", () => {
    expect(capitalizaDe("mutuo", true)).toBe(false);
    expect(CATALOGO.mutuo.capitaliza).toBe("renovacion");
  });

  it("bono: el cupón se paga a una cuenta y no capitaliza", () => {
    expect(capitalizaDe("bono", true)).toBe(false);
    expect(pagaACuenta("bono", null)).toBe(true);
  });

  it("fondo abierto: capitaliza implícito en el valor cuota", () => {
    expect(capitalizaDe("fondo_abierto", null)).toBe(true);
    expect(pagaACuenta("fondo_abierto", true)).toBe(false);
  });

  it("fondo cerrado y fideicomiso: según reglamento/contrato (elegible)", () => {
    expect(capitalizaDe("fondo_cerrado", null)).toBeNull();
    expect(capitalizaDe("fideicomiso", false)).toBe(false);
    expect(pagaACuenta("fideicomiso", false)).toBe(true);
  });

  it("acción/ETF: dividendos a una cuenta, no capitaliza", () => {
    expect(capitalizaDe("accion_etf", true)).toBe(false);
    expect(pagaACuenta("accion_etf", null)).toBe(true);
  });

  it("los cobros (interés, cupón, dividendo) solo caen en efectivo o en una cuenta", () => {
    expect(TIPOS_FIN.filter(puedeRecibirCobros)).toEqual(["efectivo", "corriente", "ahorro", "alto_rendimiento"]);
  });

  it("retención: certificados bancarios 10 % por defecto (editable); los puestos de bolsa no retienen y cobran comisión", () => {
    expect(retencionDe("certificado", null)).toBe("0.10");
    expect(retencionDe("certificado", "0.05")).toBe("0.05");
    expect(retencionDe("mutuo", null)).toBe("0");
    for (const t of ["mutuo", "bono", "fondo_abierto", "fondo_cerrado", "accion_etf", "fideicomiso"] as TipoFin[]) expect(CATALOGO[t].comisionPuesto).toBe(true);
    expect(CATALOGO.certificado.comisionPuesto).toBe(false);
  });

  it("UNA INVERSIÓN NUNCA SE USA PARA PAGAR", () => {
    for (const t of INVERSIONES) {
      expect(esInversionFin(t)).toBe(true);
      expect(aparece(fila(t, true), "pago", "cuenta")).toBe(false);
      expect(aparece(fila(t), "pago_deuda", "origen")).toBe(false);
    }
  });

  it("la moneda es independiente del tipo: el catálogo no fija moneda (DOP, USD o EUR en cualquier tipo)", () => {
    for (const t of TIPOS_FIN) expect(Object.keys(CATALOGO[t])).not.toContain("moneda");
  });

  it("cada tipo tiene su clase del motor y las cuentas de banco su subtipo", () => {
    expect(claseDeTipo("corriente")).toEqual({ clase: "ahorros", subtipo: "corriente" });
    expect(claseDeTipo("alto_rendimiento")).toEqual({ clase: "ahorros", subtipo: "alto_rendimiento" });
    expect(claseDeTipo("fondo_abierto", "rentavariable").clase).toBe("rentavariable");
    expect(claseDeTipo("certificado", "rentavariable").clase).toBe("rentafija");
    expect(claseDeTipo("bien").clase).toBe("otros");
  });

  it("se enlazan solas al Presupuesto: cuentas y deudas siempre; inversiones de saldo; nunca acciones ni bienes", () => {
    expect(TIPOS_FIN.filter((t) => seEnlazaSola(t, true))).toEqual([
      "efectivo", "corriente", "ahorro", "alto_rendimiento", "certificado", "mutuo", "bono", "fondo_abierto", "fondo_cerrado", "fideicomiso", "tarjeta", "prestamo", "otra_deuda",
    ]);
    expect(seEnlazaSola("fondo_abierto", false)).toBe(false);
    expect(seEnlazaSola("tarjeta", false)).toBe(true);
  });
});

describe("B · listas con lógica bancaria (tabla de verdad tipo × formulario)", () => {
  it("¿Con qué pagaste?: efectivo, corriente, ahorro, alto rendimiento con débito y tarjetas", () => {
    expect(lista("pago", "cuenta", false)).toEqual(["efectivo", "corriente", "ahorro", "tarjeta"]);
    expect(lista("pago", "cuenta", true)).toEqual(["efectivo", "corriente", "ahorro", "alto_rendimiento", "tarjeta"]);
  });

  it("¿A qué cuenta entra? (ingreso): efectivo y cuentas; no tarjetas, inversiones ni préstamos", () => {
    expect(lista("ingreso", "cuenta")).toEqual(["efectivo", "corriente", "ahorro", "alto_rendimiento"]);
  });

  it("¿A dónde va el ahorro?: todo tipo con destino = sí; no corriente, tarjetas ni préstamos", () => {
    expect(lista("ahorro", "destino")).toEqual(["efectivo", "ahorro", "alto_rendimiento", ...INVERSIONES]);
    expect(lista("ahorro", "origen")).toEqual(["efectivo", "corriente", "ahorro", "alto_rendimiento"]);
  });

  it("Pago de tarjeta o préstamo: sale de efectivo/cuentas; va a tarjetas y préstamos; nunca inversiones", () => {
    expect(lista("pago_deuda", "origen")).toEqual(["efectivo", "corriente", "ahorro", "alto_rendimiento"]);
    expect(lista("pago_deuda", "destino")).toEqual(["tarjeta", "prestamo", "otra_deuda"]);
  });

  it("Cambio de moneda: efectivo y cuentas (de las dos monedas); no inversiones", () => {
    expect(lista("cambio", "origen")).toEqual(["efectivo", "corriente", "ahorro", "alto_rendimiento"]);
    expect(lista("cambio", "destino")).toEqual(["efectivo", "corriente", "ahorro", "alto_rendimiento"]);
  });

  it("Rescate o venta de inversión: sale de la inversión; va a una cuenta; no tarjetas ni préstamos", () => {
    expect(lista("rescate", "origen")).toEqual(INVERSIONES);
    expect(lista("rescate", "destino")).toEqual(["efectivo", "corriente", "ahorro", "alto_rendimiento"]);
  });

  it("los bienes no aparecen en ninguna lista", () => {
    for (const f of FORMULARIOS) for (const r of ROLES[f]) expect(aparece(fila("bien", true), f, r)).toBe(false);
  });

  it("cuentasPara filtra cualquier lista con la misma regla", () => {
    const filas = [{ tipo: "corriente" as TipoFin, debito: false, n: 1 }, { tipo: "certificado" as TipoFin, debito: false, n: 2 }, { tipo: "tarjeta" as TipoFin, debito: false, n: 3 }];
    expect(cuentasPara(filas, "pago", "cuenta").map((x) => x.n)).toEqual([1, 3]);
    expect(cuentasPara(filas, "ahorro", "destino").map((x) => x.n)).toEqual([2]);
  });

  it("la base usa EXACTAMENTE la misma tabla: el bloque VALUES de la migración es tablaDeVerdad()", () => {
    const sql = readFileSync(join(import.meta.dirname, "..", "..", "supabase", "migrations", "20261029000100_nucleo_v2.sql"), "utf8");
    const bloque = sql.slice(sql.indexOf("-- tabla-catalogo: inicio"), sql.indexOf("-- tabla-catalogo: fin"));
    const filas = [...bloque.matchAll(/\('([a-z_]+)', (true|false), '([a-z_]+)', '([a-z_]+)'\)/g)].map((m) => ({ tipo: m[1], debito: m[2] === "true", formulario: m[3], rol: m[4] }));
    expect(filas).toEqual(tablaDeVerdad());
  });
});

describe("validación de un movimiento (la misma regla que el trigger de la base)", () => {
  const n = (tipo: TipoFin, nombre: string, debito = false) => ({ tipo, nombre, debito });
  it("gastar con una inversión: NO, primero «Rescate o venta»", () => {
    expect(errorDeCuentas("gasto", n("certificado", "Certificado APAP"), null)).toMatch(/nunca se usa para pagar.*Rescate o venta/);
  });
  it("gastar con alto rendimiento sin débito: no; con débito: sí", () => {
    expect(errorDeCuentas("gasto", n("alto_rendimiento", "Alto"), null)).toMatch(/débito/);
    expect(errorDeCuentas("gasto", n("alto_rendimiento", "Alto", true), null)).toBeNull();
  });
  it("comprar con tarjeta es un gasto permitido", () => {
    expect(errorDeCuentas("gasto", n("tarjeta", "Visa"), null)).toBeNull();
  });
  it("un ingreso no entra a una tarjeta ni a un préstamo", () => {
    expect(errorDeCuentas("ingreso", n("tarjeta", "Visa"), null)).toMatch(/no recibe ingresos/);
    expect(errorDeCuentas("ingreso", n("corriente", "Nómina"), null)).toBeNull();
  });
  it("pagar la tarjeta: de una cuenta a la tarjeta; nunca desde una inversión ni hacia una cuenta", () => {
    expect(errorDeCuentas("pago_tarjeta", n("corriente", "Nómina"), n("tarjeta", "Visa"))).toBeNull();
    expect(errorDeCuentas("pago_tarjeta", n("mutuo", "Mutuo"), n("tarjeta", "Visa"))).toMatch(/sale de efectivo o de una cuenta/);
    expect(errorDeCuentas("pago_tarjeta", n("corriente", "Nómina"), n("ahorro", "Ahorro"))).toMatch(/no es una tarjeta/);
  });
  it("ahorro: de una cuenta a una inversión; rescate: de la inversión a una cuenta", () => {
    expect(errorDeCuentas("transferencia", n("corriente", "Nómina"), n("certificado", "CD"))).toBeNull();
    expect(errorDeCuentas("transferencia", n("certificado", "CD"), n("corriente", "Nómina"))).toBeNull();
    expect(errorDeCuentas("transferencia", n("certificado", "CD"), n("tarjeta", "Visa"))).toMatch(/rescate o venta va a efectivo/);
  });
  it("mover dinero a una tarjeta no es un pago: se pide «Pago de tarjeta o préstamo»", () => {
    expect(errorDeCuentas("transferencia", n("corriente", "Nómina"), n("tarjeta", "Visa"))).toMatch(/Pago de tarjeta o préstamo/);
  });
});

describe("tipo de las filas que ya existían (migración sin adivinar de más)", () => {
  it("clase y subtipo deciden; lo dudoso queda «por confirmar»", () => {
    expect(tipoInicial({ clase: "efectivo", subtipo: null, nombre: "EUROS" })).toEqual({ tipo: "efectivo", seguro: true });
    expect(tipoInicial({ clase: "ahorros", subtipo: "corriente", nombre: "Popular" })).toEqual({ tipo: "corriente", seguro: true });
    expect(tipoInicial({ clase: "ahorros", subtipo: null, nombre: "Ahorro BHD" })).toEqual({ tipo: "ahorro", seguro: false });
    expect(tipoInicial({ clase: "ahorros", subtipo: null, nombre: "Cuenta Alto Rendimiento" })).toEqual({ tipo: "alto_rendimiento", seguro: false });
    expect(tipoInicial({ clase: "rentafija", subtipo: null, nombre: "Mutuo Parallax" })).toEqual({ tipo: "mutuo", seguro: false });
    expect(tipoInicial({ clase: "rentafija", subtipo: null, nombre: "Bono Hacienda 2030" })).toEqual({ tipo: "bono", seguro: false });
    expect(tipoInicial({ clase: "rentafija", subtipo: null, nombre: "Certificado" })).toEqual({ tipo: "certificado", seguro: false });
    expect(tipoInicial({ clase: "rentavariable", subtipo: null, nombre: "VOO", simbolo: "VOO" })).toEqual({ tipo: "accion_etf", seguro: true });
    expect(tipoInicial({ clase: "rentavariable", subtipo: null, nombre: "Fondo Abierto Reservas" })).toEqual({ tipo: "fondo_abierto", seguro: false });
    expect(tipoInicial({ clase: "tarjeta", subtipo: null, nombre: "Visa" })).toEqual({ tipo: "tarjeta", seguro: true });
    expect(tipoInicial({ clase: "deuda", subtipo: null, nombre: "Tío" })).toEqual({ tipo: "otra_deuda", seguro: true });
    expect(tipoInicial({ clase: "otros", subtipo: "vehiculo", nombre: "Carro" })).toEqual({ tipo: "bien", seguro: true });
  });
});
