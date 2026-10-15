import { describe, expect, it } from "vitest";
import { diasDelMes, diasEntre, esFecha, hoyRD, sumarDias, sumarMeses, ultimoDia, diaSemanaLunes } from "./fechas";
import { abreviado, rd } from "./formato";
import {
  aDOP,
  diasDeRecurrente,
  horizonte,
  movimientosDelMes,
  ocurreEn,
  presupuestoDelMes,
  resumir,
  simular,
} from "./motor";
import type { Cuenta, DatosCaja, Movimiento, Recurrente } from "./tipos";

// Datos de ejemplo inventados para las pruebas (no son de Mena).
function cuenta(id: string, tipo: Cuenta["tipo"], saldoInicial = "0"): Cuenta {
  return { id, nombre: id, tipo, saldoInicial, limite: null, orden: 0 };
}

function rec(p: Partial<Recurrente> & { id: string }): Recurrente {
  return {
    nombre: p.id,
    tipo: "gasto",
    monto: "100",
    moneda: "DOP",
    pagoTotal: false,
    cuenta: "banco",
    destino: null,
    categoria: null,
    frecuencia: "mensual",
    dias: "1",
    cadaN: null,
    fecha: null,
    desde: null,
    hasta: null,
    activo: true,
    ...p,
  };
}

function mov(p: Partial<Movimiento> & { id: string; fecha: string }): Movimiento {
  return {
    tipo: "gasto",
    monto: "0",
    moneda: "DOP",
    tasa: null,
    cuenta: "banco",
    destino: null,
    categoria: null,
    nota: null,
    recurrenteId: null,
    ...p,
  };
}

function base(p: Partial<DatosCaja> = {}): DatosCaja {
  return {
    config: { inicio: "2026-10-01", colchon: "5000", margen: "3000", tasaUSD: "60.50" },
    cuentas: [cuenta("banco", "banco", "20000"), cuenta("cash", "efectivo", "1000"), cuenta("ahorro", "ahorro", "50000"), cuenta("visa", "tarjeta", "8000")],
    categorias: [],
    recurrentes: [],
    movimientos: [],
    omitidos: [],
    saldos: [],
    notas: [],
    ...p,
  };
}

const dia = (sim: ReturnType<typeof simular>, f: string) => {
  const d = sim.porFecha.get(f);
  if (!d) throw new Error(`sin día ${f}`);
  return d;
};

describe("fechas", () => {
  it("días del mes, febrero bisiesto y no bisiesto", () => {
    expect(diasDelMes(2026, 2)).toBe(28);
    expect(diasDelMes(2028, 2)).toBe(29);
    expect(diasDelMes(2026, 4)).toBe(30);
    expect(diasDelMes(2026, 12)).toBe(31);
    expect(ultimoDia("2026-02")).toBe("2026-02-28");
  });
  it("aritmética de días sin zona horaria", () => {
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(diasEntre("2026-10-01", "2026-11-01")).toBe(31);
    expect(sumarMeses("2026-11", 2)).toBe("2027-01");
    expect(sumarMeses("2026-01", -1)).toBe("2025-12");
    expect(esFecha("2026-02-30")).toBe(false);
    expect(esFecha("2026-02-28")).toBe(true);
    expect(diaSemanaLunes("2026-10-15")).toBe(3); // jueves
  });
  it("hoy en RD (UTC−4): a las 02:00 UTC todavía es el día anterior", () => {
    expect(hoyRD(new Date("2026-10-16T02:00:00Z"))).toBe("2026-10-15");
    expect(hoyRD(new Date("2026-10-16T04:00:00Z"))).toBe("2026-10-16");
  });
});

describe("ocurrencias de recurrentes", () => {
  const inicio = "2026-01-01";
  it("días fijos: el 31 cae el último día en meses de 30 y en febrero", () => {
    const r = rec({ id: "r", dias: "31" });
    expect(ocurreEn(r, "2026-10-31", inicio)).toBe(true);
    expect(ocurreEn(r, "2026-10-30", inicio)).toBe(false);
    expect(ocurreEn(r, "2026-11-30", inicio)).toBe(true);
    expect(ocurreEn(r, "2026-02-28", inicio)).toBe(true);
    expect(ocurreEn(r, "2028-02-28", inicio)).toBe(false);
    expect(ocurreEn(r, "2028-02-29", inicio)).toBe(true);
  });
  it("«15, 30»: en febrero el 30 cae el 28; varios separadores", () => {
    const r = rec({ id: "r", dias: "15, 30" });
    expect(ocurreEn(r, "2026-02-15", inicio)).toBe(true);
    expect(ocurreEn(r, "2026-02-28", inicio)).toBe(true);
    expect(ocurreEn(r, "2026-03-30", inicio)).toBe(true);
    expect(ocurreEn(r, "2026-03-31", inicio)).toBe(false);
    expect(diasDeRecurrente("5 20,  31, 0, 40, x")).toEqual([5, 20, 31]);
  });
  it("cada N días desde «desde», o desde el inicio", () => {
    const r = rec({ id: "r", frecuencia: "cada_n", cadaN: 14, desde: "2026-10-02" });
    expect(ocurreEn(r, "2026-10-02", inicio)).toBe(true);
    expect(ocurreEn(r, "2026-10-16", inicio)).toBe(true);
    expect(ocurreEn(r, "2026-10-30", inicio)).toBe(true);
    expect(ocurreEn(r, "2026-10-09", inicio)).toBe(false);
    expect(ocurreEn(r, "2026-09-18", inicio)).toBe(false); // antes de desde
    const sinDesde = rec({ id: "r2", frecuencia: "cada_n", cadaN: 7 });
    expect(ocurreEn(sinDesde, "2026-01-08", inicio)).toBe(true);
    expect(ocurreEn(sinDesde, "2026-01-09", inicio)).toBe(false);
    // cadaN vacío o 0 → cada día
    expect(ocurreEn(rec({ id: "r3", frecuencia: "cada_n", cadaN: null }), "2026-05-05", inicio)).toBe(true);
  });
  it("única, inactivo y desde/hasta", () => {
    expect(ocurreEn(rec({ id: "u", frecuencia: "unica", fecha: "2026-10-20" }), "2026-10-20", inicio)).toBe(true);
    expect(ocurreEn(rec({ id: "u", frecuencia: "unica", fecha: "2026-10-20" }), "2026-10-21", inicio)).toBe(false);
    expect(ocurreEn(rec({ id: "i", dias: "5", activo: false }), "2026-10-05", inicio)).toBe(false);
    const r = rec({ id: "dh", dias: "5", desde: "2026-11-01", hasta: "2027-01-31" });
    expect(ocurreEn(r, "2026-10-05", inicio)).toBe(false);
    expect(ocurreEn(r, "2026-11-05", inicio)).toBe(true);
    expect(ocurreEn(r, "2027-01-05", inicio)).toBe(true);
    expect(ocurreEn(r, "2027-02-05", inicio)).toBe(false);
  });
});

describe("conversión a RD$", () => {
  it("US$ con tasa propia, con tasa general y sin ninguna (no se inventa)", () => {
    const cfg = base().config;
    expect(aDOP("100", "USD", "59.25", cfg)!.toString()).toBe("5925");
    expect(aDOP("100.10", "USD", null, cfg)!.toString()).toBe("6056.05");
    expect(aDOP("100", "USD", null, { ...cfg!, tasaUSD: null })).toBeNull();
    expect(aDOP("0.1", "DOP", null, cfg)!.plus("0.2").toString()).toBe("0.3");
  });
});

describe("simulación", () => {
  it("arranca con los saldos iniciales; tarjeta como deuda; disponible = banco + efectivo", () => {
    const sim = simular(base(), { hoy: "2026-10-01", hasta: "2026-10-03" });
    const d = dia(sim, "2026-10-01");
    expect(d.posiciones).toEqual({ banco: "20000", cash: "1000", ahorro: "50000", visa: "-8000" });
    expect(d.disponible).toBe("21000");
    expect(d.ahorroTotal).toBe("50000");
    expect(d.deuda).toBe("8000");
    expect(d.estado).toBe("holgado");
    expect(sim.dias.map((x) => x.fecha)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
  });

  it("planificado desde hoy se aplica; pasado sin confirmar queda por confirmar y no se aplica", () => {
    const datos = base({ recurrentes: [rec({ id: "luz", dias: "5, 20", monto: "1500.75" })] });
    const sim = simular(datos, { hoy: "2026-10-10", hasta: "2026-10-31" });
    const d5 = dia(sim, "2026-10-05");
    expect(d5.porConfirmar.map((o) => o.recurrenteId)).toEqual(["luz"]);
    expect(d5.planificados).toEqual([]);
    expect(d5.disponible).toBe("21000");
    const d20 = dia(sim, "2026-10-20");
    expect(d20.planificados[0]).toMatchObject({ recurrenteId: "luz", monto: "1500.75", montoDOP: "1500.75" });
    expect(d20.salidas).toBe("1500.75");
    expect(d20.disponible).toBe("19499.25");
    // Hoy mismo cuenta como planificado.
    const sim2 = simular(datos, { hoy: "2026-10-05", hasta: "2026-10-06" });
    expect(dia(sim2, "2026-10-05").planificados).toHaveLength(1);
    expect(dia(sim2, "2026-10-05").disponible).toBe("19499.25");
  });

  it("confirmado: el movimiento registrado con su recurrenteId reemplaza al planificado ese día", () => {
    const datos = base({
      recurrentes: [rec({ id: "luz", dias: "5", monto: "1500" })],
      movimientos: [mov({ id: "m1", fecha: "2026-10-05", monto: "1620.40", recurrenteId: "luz" })],
    });
    const sim = simular(datos, { hoy: "2026-10-10", hasta: "2026-10-10" });
    const d = dia(sim, "2026-10-05");
    expect(d.porConfirmar).toEqual([]);
    expect(d.planificados).toEqual([]);
    expect(d.registrados[0].montoDOP).toBe("1620.4");
    expect(d.disponible).toBe("19379.6");
    // Confirmado en otro día no tapa el del 5.
    const otro = simular(
      { ...datos, movimientos: [mov({ id: "m1", fecha: "2026-10-06", monto: "1500", recurrenteId: "luz" })] },
      { hoy: "2026-10-10", hasta: "2026-10-10" },
    );
    expect(dia(otro, "2026-10-05").porConfirmar).toHaveLength(1);
  });

  it("omitido: no se aplica ni queda por confirmar; se lista como omitido", () => {
    const datos = base({
      recurrentes: [rec({ id: "gym", dias: "15", monto: "2000" })],
      omitidos: [{ fecha: "2026-10-15", recurrenteId: "gym" }, { fecha: "2026-09-15", recurrenteId: "gym" }],
    });
    const sim = simular(datos, { hoy: "2026-10-10", hasta: "2026-11-20" });
    expect(dia(sim, "2026-10-15").omitidos.map((o) => o.recurrenteId)).toEqual(["gym"]);
    expect(dia(sim, "2026-10-15").disponible).toBe("21000");
    expect(dia(sim, "2026-11-15").planificados).toHaveLength(1);
    expect(dia(sim, "2026-11-15").disponible).toBe("19000");
  });

  it("inactivo y fuera de desde/hasta no ocurren en la simulación", () => {
    const datos = base({
      recurrentes: [
        rec({ id: "viejo", dias: "10", activo: false }),
        rec({ id: "futuro", dias: "10", desde: "2026-11-01" }),
        rec({ id: "vencido", dias: "10", hasta: "2026-10-09" }),
      ],
    });
    const sim = simular(datos, { hoy: "2026-10-01", hasta: "2026-11-30" });
    expect(dia(sim, "2026-10-10").planificados).toEqual([]);
    expect(dia(sim, "2026-11-10").planificados.map((o) => o.recurrenteId)).toEqual(["futuro"]);
  });

  it("registrados se aplican en cualquier fecha; transferencia a ahorro suma al ahorro del día", () => {
    const datos = base({
      movimientos: [
        mov({ id: "a", fecha: "2026-10-02", tipo: "ingreso", monto: "30000" }),
        mov({ id: "b", fecha: "2026-10-02", tipo: "transferencia", monto: "10000", destino: "ahorro" }),
        mov({ id: "c", fecha: "2026-10-02", tipo: "transferencia", monto: "500", cuenta: "banco", destino: "cash" }),
        mov({ id: "d", fecha: "2026-10-02", tipo: "gasto", monto: "250", cuenta: "cash" }),
        mov({ id: "e", fecha: "2026-10-02", tipo: "gasto", monto: "99", cuenta: "no-existe" }),
      ],
    });
    const sim = simular(datos, { hoy: "2026-10-01", hasta: "2026-10-02" });
    const d = dia(sim, "2026-10-02");
    expect(d.posiciones).toMatchObject({ banco: "39500", cash: "1250", ahorro: "60000" });
    expect(d.entradas).toBe("30000");
    expect(d.salidas).toBe("349"); // el gasto con cuenta inexistente cuenta en salidas pero no mueve saldos
    expect(d.ahorro).toBe("10000");
    expect(d.disponible).toBe("40750");
    expect(d.tieneIngreso).toBe(true);
  });

  it("gasto con tarjeta aumenta la deuda; pago de tarjeta la reduce", () => {
    const datos = base({
      movimientos: [
        mov({ id: "a", fecha: "2026-10-02", tipo: "gasto", monto: "1200", cuenta: "visa" }),
        mov({ id: "b", fecha: "2026-10-03", tipo: "pago_tarjeta", monto: "5000", cuenta: "banco", destino: "visa" }),
      ],
    });
    const sim = simular(datos, { hoy: "2026-10-01", hasta: "2026-10-03" });
    expect(dia(sim, "2026-10-02").deuda).toBe("9200");
    expect(dia(sim, "2026-10-02").disponible).toBe("21000");
    expect(dia(sim, "2026-10-03").deuda).toBe("4200");
    expect(dia(sim, "2026-10-03").disponible).toBe("16000");
  });

  it("pago total de tarjeta: paga exactamente lo adeudado ese día (y 0 si no se debe)", () => {
    const datos = base({
      recurrentes: [rec({ id: "pt", tipo: "pago_tarjeta", pagoTotal: true, monto: "0", destino: "visa", dias: "20" })],
      movimientos: [mov({ id: "a", fecha: "2026-10-12", tipo: "gasto", monto: "1234.56", cuenta: "visa", moneda: "USD", tasa: "1" })],
    });
    const sim = simular(datos, { hoy: "2026-10-10", hasta: "2026-11-21" });
    const d = dia(sim, "2026-10-20");
    expect(d.planificados[0]).toMatchObject({ monto: "9234.56", moneda: "DOP", montoDOP: "9234.56", pagoTotal: true });
    expect(d.deuda).toBe("0");
    expect(d.disponible).toBe("11765.44");
    expect(dia(sim, "2026-11-20").planificados[0].monto).toBe("0");
    expect(dia(sim, "2026-11-20").disponible).toBe("11765.44");
  });

  it("USD: tasa propia del movimiento, tasa general para recurrentes, y sin tasa no se aplica", () => {
    const datos = base({
      recurrentes: [rec({ id: "netflix", dias: "3", monto: "15.99", moneda: "USD" })],
      movimientos: [mov({ id: "a", fecha: "2026-10-02", tipo: "ingreso", monto: "1000", moneda: "USD", tasa: "59.10" })],
    });
    const sim = simular(datos, { hoy: "2026-10-01", hasta: "2026-10-03" });
    expect(dia(sim, "2026-10-02").entradas).toBe("59100");
    expect(dia(sim, "2026-10-03").planificados[0].montoDOP).toBe("967.395");
    expect(dia(sim, "2026-10-03").disponible).toBe("79132.605");
    expect(sim.advertencias).toEqual([]);

    const sinTasa = simular({ ...datos, config: { ...datos.config!, tasaUSD: null } }, { hoy: "2026-10-01", hasta: "2026-10-03" });
    expect(dia(sinTasa, "2026-10-03").planificados[0].montoDOP).toBeNull();
    expect(dia(sinTasa, "2026-10-03").disponible).toBe("80100");
    expect(sinTasa.advertencias[0]).toMatch(/1 monto\(s\) en US\$ sin tasa/);
  });

  it("saldo real corrige la posición y deja la diferencia (banco y tarjeta)", () => {
    const datos = base({
      recurrentes: [rec({ id: "super", dias: "10", monto: "3000" })],
      saldos: [
        { fecha: "2026-10-10", cuentaId: "banco", saldo: "16500.25" },
        { fecha: "2026-10-10", cuentaId: "visa", saldo: "8100" },
        { fecha: "2026-10-10", cuentaId: "fantasma", saldo: "1" },
      ],
    });
    const sim = simular(datos, { hoy: "2026-10-05", hasta: "2026-10-11" });
    const d = dia(sim, "2026-10-10");
    expect(d.ajustes).toEqual([
      { cuentaId: "banco", real: "16500.25", esperado: "17000", diferencia: "-499.75" },
      { cuentaId: "visa", real: "8100", esperado: "8000", diferencia: "100" },
    ]);
    expect(d.posiciones.banco).toBe("16500.25");
    expect(d.posiciones.visa).toBe("-8100");
    expect(dia(sim, "2026-10-11").disponible).toBe("17500.25");
  });

  it("estados: holgado, cerca del colchón y bajo el colchón", () => {
    const datos = base({
      cuentas: [cuenta("banco", "banco", "9000")],
      movimientos: [
        mov({ id: "a", fecha: "2026-10-02", monto: "1000.01" }),
        mov({ id: "b", fecha: "2026-10-03", monto: "3000" }),
      ],
    });
    const sim = simular(datos, { hoy: "2026-10-01", hasta: "2026-10-03" });
    // 9000 ≥ colchón + margen (8000) → holgado; 7999.99 → cerca; 4999.99 → bajo.
    expect(sim.dias.map((d) => d.estado)).toEqual(["holgado", "cerca", "bajo"]);
  });

  it("notas del día y días antes del inicio no se simulan", () => {
    const datos = base({ notas: [{ fecha: "2026-10-02", nota: "Revisar" }] });
    const sim = simular(datos, { hoy: "2026-10-01", hasta: "2026-10-02" });
    expect(dia(sim, "2026-10-02").nota).toBe("Revisar");
    expect(sim.porFecha.has("2026-09-30")).toBe(false);
    expect(simular(datos, { hoy: "2026-10-01", hasta: "2026-09-01" }).dias).toEqual([]);
    expect(simular({ ...datos, config: null }, { hoy: "2026-10-01", hasta: "2026-10-02" }).advertencias[0]).toMatch(/inicio/);
  });

  it("horizonte: fin del mes visible u hoy + 62 días", () => {
    expect(horizonte("2026-10", "2026-10-15")).toBe("2026-12-16");
    expect(horizonte("2027-03", "2026-10-15")).toBe("2027-03-31");
  });
});

describe("resumen", () => {
  it("puedes gastar hasta el próximo ingreso: mínimo del disponible antes del ingreso menos el colchón", () => {
    const datos = base({
      cuentas: [cuenta("banco", "banco", "20000")],
      recurrentes: [
        rec({ id: "sueldo", tipo: "ingreso", dias: "15, 30", monto: "40000" }),
        rec({ id: "renta", dias: "12", monto: "9000" }),
        rec({ id: "luz", dias: "14", monto: "1000" }),
        rec({ id: "viejo", dias: "5", monto: "700" }),
      ],
    });
    const sim = simular(datos, { hoy: "2026-10-10", hasta: "2026-12-31" });
    const r = resumir(sim, datos.config);
    expect(r.puedesGastar).toEqual({ monto: "5000", hasta: "2026-10-15", diaMinimo: "2026-10-14" });
    expect(r.disponibleHoy).toBe("20000");
    expect(r.porConfirmar).toMatchObject({ cantidad: 1, salidas: "700", entradas: "0" });
    expect(r.estadoHoy).toBe("holgado");
  });

  it("no negativo, y sin ingreso a la vista usa todo el horizonte", () => {
    const datos = base({ cuentas: [cuenta("banco", "banco", "4000")], recurrentes: [rec({ id: "x", dias: "20", monto: "100" })] });
    const sim = simular(datos, { hoy: "2026-10-10", hasta: "2026-12-11" });
    const r = resumir(sim, datos.config);
    expect(r.puedesGastar).toMatchObject({ monto: "0", hasta: null });
  });

  it("deuda en tarjetas y ahorro de hoy", () => {
    const sim = simular(base(), { hoy: "2026-10-05", hasta: "2026-10-10" });
    const r = resumir(sim, base().config);
    expect(r.deudaTarjetas).toBe("8000");
    expect(r.ahorroTotal).toBe("50000");
  });
});

describe("movimientos del mes y presupuesto", () => {
  const datos = base({
    categorias: [
      { id: "sal", nombre: "Salario", grupo: "ingreso", presupuesto: "80000" },
      { id: "com", nombre: "Comida", grupo: "variable", presupuesto: "12000" },
      { id: "luz", nombre: "Luz", grupo: "fijo", presupuesto: null },
      { id: "inv", nombre: "Inversión", grupo: "ahorro", presupuesto: "10000" },
    ],
    recurrentes: [rec({ id: "super", dias: "25", monto: "4000", categoria: "com" })],
    movimientos: [
      mov({ id: "1", fecha: "2026-10-01", tipo: "ingreso", monto: "40000", categoria: "sal" }),
      mov({ id: "2", fecha: "2026-10-03", monto: "2500.50", categoria: "com" }),
      mov({ id: "3", fecha: "2026-10-04", monto: "50", moneda: "USD", categoria: "com" }),
      mov({ id: "4", fecha: "2026-10-05", tipo: "transferencia", monto: "8000", destino: "ahorro", categoria: "inv" }),
      mov({ id: "5", fecha: "2026-09-30", monto: "999" }),
    ],
  });

  it("totales, tasa de ahorro y US$ convertido", () => {
    const t = movimientosDelMes(datos, "2026-10");
    expect(t.movimientos.map((m) => m.id)).toEqual(["1", "2", "3", "4"]);
    expect(t.ingresos).toBe("40000");
    expect(t.gastos).toBe("5525.5");
    expect(t.ahorro).toBe("8000");
    expect(t.neto).toBe("34474.5");
    expect(t.tasaAhorro).toBe("20.0");
    expect(movimientosDelMes(datos, "2026-08").tasaAhorro).toBeNull();
  });

  it("presupuesto por grupo: real, viene (planificado desde hoy) y queda", () => {
    const sim = simular(datos, { hoy: "2026-10-10", hasta: "2026-10-31" });
    const g = presupuestoDelMes(datos, sim, "2026-10");
    expect(g.map((x) => x.grupo)).toEqual(["ingreso", "fijo", "variable", "ahorro"]);
    const variable = g.find((x) => x.grupo === "variable")!;
    expect(variable.filas[0]).toMatchObject({ real: "5525.5", viene: "4000", queda: "2474.5", usado: 79 });
    const fijo = g.find((x) => x.grupo === "fijo")!;
    expect(fijo.filas[0]).toMatchObject({ presupuesto: null, queda: null, usado: null });
    expect(g.find((x) => x.grupo === "ahorro")!.filas[0]).toMatchObject({ real: "8000", queda: "2000" });
  });
});

describe("formato", () => {
  it("saldo abreviado para las celdas", () => {
    expect(abreviado("850.49")).toBe("850");
    expect(abreviado("12345")).toBe("12.3k");
    expect(abreviado("12000")).toBe("12k");
    expect(abreviado("-4567.8")).toBe("−4.6k");
    expect(abreviado("125499")).toBe("125k");
    expect(abreviado("999999")).toBe("1M");
    expect(abreviado("1250000")).toBe("1.25M");
    expect(abreviado("-0.2")).toBe("0");
  });
  it("RD$ con signo tipográfico", () => {
    expect(rd("-1500.5")).toBe("−RD$ 1,500.50");
    expect(rd("20000")).toBe("RD$ 20,000.00");
  });
});
