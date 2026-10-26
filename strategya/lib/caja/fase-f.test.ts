// Fase F en el Presupuesto: dólar del BCRD por fecha, cuentas en US$ y pagos de deudas (capital e interés).
// Datos SINTÉTICOS (cifras redondas inventadas, no son de Mena).

import { describe, expect, it } from "vitest";
import { deudaAntesDe, interesConTasa, separarPago } from "./deudas";
import { movimientosDelMes, simular } from "./motor";
import { estadoDeResultados, INTERESES_DEUDAS } from "./resultados";
import { aDOP, tasaBcrd, tasaPara, type TasasUSD } from "./tasas";
import type { Cuenta, DatosCaja, Movimiento } from "./tipos";
import { validarMovimiento } from "./validar";
import Big from "big.js";

const TASAS: TasasUSD = {
  hoy: "2026-10-20",
  serie: [
    { fecha: "2026-10-01", valor: "60.00", url: null },
    { fecha: "2026-10-09", valor: "61.00", url: null }, // viernes
    { fecha: "2026-10-14", valor: "62.00", url: null },
  ],
};

const cuenta = (id: string, tipo: Cuenta["tipo"], saldoInicial: string, extra: Partial<Cuenta> = {}): Cuenta => ({ id, nombre: id, tipo, saldoInicial, limite: null, orden: 0, ...extra });
const mov = (p: Partial<Movimiento> & { id: string }): Movimiento => ({
  fecha: "2026-10-05", tipo: "gasto", monto: "100", moneda: "DOP", tasa: null, cuenta: "b", destino: null, categoria: null, nota: null, recurrenteId: null, ...p,
});
function datos(p: Partial<DatosCaja> = {}): DatosCaja {
  return {
    config: { inicio: "2026-10-01", colchon: "0", margen: "0", tasaUSD: "99" },
    cuentas: [cuenta("b", "banco", "100000"), cuenta("u", "banco", "1000", { moneda: "USD" }), cuenta("p", "prestamo", "320000", { tasaAnual: "0.12" }), cuenta("v", "tarjeta", "12000")],
    categorias: [
      { id: "c", nombre: "Comida", tipo: "gasto", adicional: null },
      { id: "if", nombre: "Intereses del carro", tipo: "gasto_financiero", adicional: null },
    ],
    recurrentes: [],
    movimientos: [],
    omitidos: [],
    saldos: [],
    notas: [],
    tasasUSD: TASAS,
    ...p,
  };
}

describe("dólar del BCRD de la fecha", () => {
  it("usa el último publicado hasta esa fecha (fines de semana: el del viernes) y como mucho 7 días", () => {
    expect(tasaBcrd(TASAS, "2026-10-11")).toMatchObject({ valor: "61.00", fecha: "2026-10-09", origen: "bcrd" });
    expect(tasaBcrd(TASAS, "2026-10-14")?.valor).toBe("62.00");
    expect(tasaBcrd(TASAS, "2026-09-30")).toBeNull(); // antes del primer dato
    expect(tasaBcrd({ ...TASAS, hoy: "2026-10-30" }, "2026-10-25")).toBeNull(); // 11 días sin dato: no confirmado
  });
  it("una fecha futura usa el dato de hoy (planificar), nunca inventa", () => {
    expect(tasaBcrd(TASAS, "2026-12-01")?.valor).toBe("62.00");
    expect(tasaBcrd(null, "2026-10-14")).toBeNull();
  });
  it("la tasa propia del movimiento manda; la general de Configuración ya no se usa", () => {
    expect(tasaPara("USD", "59.5", TASAS, "2026-10-14")).toMatchObject({ valor: "59.5", origen: "propia" });
    expect(aDOP("10", "USD", null, TASAS, "2026-10-14")!.toString()).toBe("620");
    expect(aDOP("10", "USD", null, { hoy: "2026-10-20", serie: [] }, "2026-10-14")).toBeNull();
    expect(aDOP("10", "DOP", null, null, "2026-10-14")!.toString()).toBe("10");
  });
});

describe("cuentas en US$", () => {
  it("la posición de la cuenta va en US$; el disponible del día en RD$ con el dólar de ese día", () => {
    const d = datos({ movimientos: [mov({ id: "1", fecha: "2026-10-14", cuenta: "u", moneda: "USD", monto: "100", categoria: "c" })] });
    const sim = simular(d, { hoy: "2026-10-20", hasta: "2026-10-14" });
    const dia = sim.porFecha.get("2026-10-14")!;
    expect(dia.posiciones.u).toBe("900");
    expect(dia.disponible).toBe(new Big("100000").plus(new Big("900").times("62")).toString());
    expect(dia.salidas).toBe("6200");
  });
  it("mover de pesos a dólares con la tasa que cobró el banco", () => {
    const d = datos({ movimientos: [mov({ id: "1", fecha: "2026-10-05", tipo: "transferencia", cuenta: "b", destino: "u", moneda: "DOP", monto: "6100", tasa: "61" })] });
    const dia = simular(d, { hoy: "2026-10-20", hasta: "2026-10-05" }).porFecha.get("2026-10-05")!;
    expect(dia.posiciones).toMatchObject({ b: "93900", u: "1100" });
  });
  it("sin dólar del BCRD, la cuenta en US$ no se suma al disponible y se avisa", () => {
    const sim = simular(datos({ tasasUSD: null }), { hoy: "2026-10-20", hasta: "2026-10-02" });
    expect(sim.porFecha.get("2026-10-02")!.disponible).toBe("100000");
    expect(sim.advertencias.join(" ")).toMatch(/no se sumó al disponible/);
  });
  it("estado de resultados: US$ con su tasa (propia o BCRD) y la lista de conversiones; sin tasa, no confirmado", () => {
    const d = datos({
      movimientos: [
        mov({ id: "1", fecha: "2026-10-11", cuenta: "u", moneda: "USD", monto: "10", categoria: "c" }), // BCRD del viernes 9: 61
        mov({ id: "2", fecha: "2026-10-12", cuenta: "u", moneda: "USD", monto: "10", tasa: "60.5", categoria: "c" }),
      ],
    });
    const e = estadoDeResultados(d, "2026-10");
    expect(e.secciones.gasto.real).toBe("1215");
    expect(e.conversiones.map((x) => [x.id, x.tasa?.origen, x.dop])).toEqual([["1", "bcrd", "610"], ["2", "propia", "605"]]);
    const sin = estadoDeResultados(datos({ tasasUSD: null, movimientos: [mov({ id: "1", cuenta: "u", moneda: "USD", monto: "10", categoria: "c" })] }), "2026-10");
    expect(sin.secciones.gasto.real).toBe("0");
    expect(sin.sinTasa).toBe(1);
    expect(sin.conversiones[0].dop).toBeNull();
  });
});

describe("pagos de tarjetas y préstamos: capital e interés", () => {
  it("interés del mes con la tasa: lo que se debía × tasa ÷ 12, a centavos, nunca más que el pago", () => {
    expect(interesConTasa(new Big("320000"), "0.12", new Big("9500")).toString()).toBe("3200");
    expect(interesConTasa(new Big("1000"), "0.18", new Big("5")).toString()).toBe("5");
    expect(interesConTasa(new Big("1234.56"), "0.1", new Big("9999")).toString()).toBe("10.29");
    expect(interesConTasa(new Big("0"), "0.12", new Big("100")).toString()).toBe("0");
  });
  it("deuda antes del pago: lo registrado hasta el día anterior", () => {
    const d = datos({ movimientos: [mov({ id: "1", fecha: "2026-10-03", tipo: "gasto", cuenta: "v", monto: "500" })] });
    expect(deudaAntesDe(d, "v", "2026-10-04")!.toString()).toBe("12500");
    expect(deudaAntesDe(d, "p", "2026-10-01")!.toString()).toBe("320000");
    expect(deudaAntesDe(d, "b", "2026-10-04")).toBeNull();
  });
  it("préstamo con tasa: se calcula; sin tasa o tarjeta: todo capital; lo escrito manda", () => {
    const d = datos();
    expect(separarPago(d, { monto: "9500", moneda: "DOP", destino: "p", fecha: "2026-10-20" }, undefined)).toMatchObject({ interes: "3200", capital: "6300", como: "tasa", deuda: "320000" });
    expect(separarPago(d, { monto: "5000", moneda: "DOP", destino: "v", fecha: "2026-10-20" }, undefined)).toMatchObject({ interes: null, capital: "5000", como: "todo" });
    expect(separarPago(d, { monto: "5000", moneda: "DOP", destino: "v", fecha: "2026-10-20" }, "800")).toMatchObject({ interes: "800", capital: "4200", como: "escrito" });
    expect(separarPago(d, { monto: "9500", moneda: "DOP", destino: "p", fecha: "2026-10-20" }, null)).toMatchObject({ interes: null, como: "todo" });
  });
  it("la deuda baja solo por el capital; el interés es salida y gasto financiero", () => {
    const d = datos({
      movimientos: [
        mov({ id: "1", fecha: "2026-10-20", tipo: "pago_tarjeta", cuenta: "b", destino: "p", monto: "9500", interes: "3200", categoria: "if" }),
        mov({ id: "2", fecha: "2026-10-21", tipo: "pago_tarjeta", cuenta: "b", destino: "v", monto: "5000", interes: "800" }),
      ],
    });
    const sim = simular(d, { hoy: "2026-10-25", hasta: "2026-10-21" });
    expect(sim.porFecha.get("2026-10-20")!.posiciones).toMatchObject({ b: "90500", p: "-313700" });
    expect(sim.porFecha.get("2026-10-20")!.salidas).toBe("3200");
    expect(sim.porFecha.get("2026-10-21")!.posiciones.v).toBe("-7800");
    const e = estadoDeResultados(d, "2026-10");
    expect(e.secciones.gasto_financiero.real).toBe("4000");
    expect(e.secciones.gasto_financiero.lineas.find((l) => l.clave === "if")?.real).toBe("3200");
    expect(e.secciones.gasto_financiero.lineas.find((l) => l.clave === INTERESES_DEUDAS)?.real).toBe("800");
    expect(e.gastosTotales.real).toBe("4000"); // el capital no es gasto
    // Movimientos del mes: «Gastaste» suma el interés; el pago completo sigue en «Pagos de tarjeta».
    const t = movimientosDelMes(d, "2026-10");
    expect(t.gastos).toBe("4000");
    expect(t.pagosTarjeta).toBe("14500");
  });
  it("el formulario: «¿cuánto fue capital?» (vacío = sin decidir; mayor que el pago = error)", () => {
    const base = { fecha: "2026-10-20", tipo: "pago_tarjeta", monto: "9,500", cuenta: "b", destino: "p" };
    const r1 = validarMovimiento({ ...base, capital: "6,300" });
    expect(r1.ok && r1.valor.interes).toBe("3200");
    const r2 = validarMovimiento({ ...base, capital: "" });
    expect(r2.ok && "interes" in r2.valor).toBe(false);
    const r3 = validarMovimiento({ ...base, capital: "9500" });
    expect(r3.ok && r3.valor.interes).toBeNull();
    expect(validarMovimiento({ ...base, capital: "10000" }).ok).toBe(false);
  });
});
