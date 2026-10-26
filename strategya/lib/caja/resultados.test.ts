import type { TasasUSD } from "./tasas";
import Big from "big.js";
import { describe, expect, it } from "vitest";
import { simular } from "./motor";
import {
  A_CUENTAS_DE_AHORRO,
  adicionalDesdeV1,
  anchoBarra,
  cifras,
  estadoDeResultados,
  fijosDelMes,
  presupuestoAhorroMensual,
  SIN_CATEGORIA_GASTO,
  SIN_CATEGORIA_INGRESO,
} from "./resultados";
import type { Categoria, Cuenta, DatosCaja, Movimiento, Recurrente } from "./tipos";

// Datos inventados para las pruebas (no son de Mena).
const cuenta = (id: string, tipo: Cuenta["tipo"]): Cuenta => ({ id, nombre: id, tipo, saldoInicial: "0", limite: null, orden: 0 });
const cat = (id: string, tipo: Categoria["tipo"], adicional: string | null = null): Categoria => ({ id, nombre: id, tipo, adicional });
const rec = (p: Partial<Recurrente> & { id: string }): Recurrente => ({
  nombre: p.id, tipo: "gasto", monto: "100", moneda: "DOP", pagoTotal: false, cuenta: "banco", destino: null, categoria: null,
  frecuencia: "mensual", dias: "1", cadaN: null, fecha: null, desde: null, hasta: null, activo: true, ...p,
});
const mov = (p: Partial<Movimiento> & { id: string }): Movimiento => ({
  fecha: "2026-10-05", tipo: "gasto", monto: "100", moneda: "DOP", tasa: null, cuenta: "banco", destino: null, categoria: null, nota: null, recurrenteId: null, ...p,
});

/** Dólar del BCRD inventado para las pruebas: el mismo valor todos los días de sep. 2026 a dic. 2027. */
function tasasDiarias(valor: string): TasasUSD {
  const serie: TasasUSD["serie"] = [];
  for (let d = new Date(Date.UTC(2026, 8, 1)); d <= new Date(Date.UTC(2027, 11, 31)); d.setUTCDate(d.getUTCDate() + 1)) serie.push({ fecha: d.toISOString().slice(0, 10), valor, url: null });
  return { hoy: "2027-12-31", serie };
}

function datos(p: Partial<DatosCaja> = {}): DatosCaja {
  return {
    config: { inicio: "2026-10-01", colchon: "0", margen: "0", tasaUSD: "60" },
    cuentas: [cuenta("banco", "banco"), cuenta("ahorro", "ahorro"), cuenta("visa", "tarjeta")],
    categorias: [],
    recurrentes: [],
    movimientos: [],
    omitidos: [],
    saldos: [],
    notas: [],
    tasasUSD: tasasDiarias("60"),
    ...p,
  };
}

/** El caso completo: una categoría de cada tipo, fijos, adicionales y movimientos. */
const COMPLETO = datos({
  categorias: [
    cat("sueldo", "ingreso"),
    cat("ventas", "ingreso", "5000"),
    cat("mercancia", "costo", "3000"),
    cat("alquiler", "gasto"),
    cat("comida", "gasto", "12000"),
    cat("intereses", "gasto_financiero", "1000"),
    cat("regalo", "otro_ingreso", "2000"),
    cat("multa", "otro_gasto"),
    cat("inversion", "ahorro_inversion", "4000"),
  ],
  recurrentes: [
    rec({ id: "quincena", tipo: "ingreso", monto: "40000", dias: "15, 30", categoria: "sueldo" }),
    rec({ id: "alq", monto: "18000", dias: "1", categoria: "alquiler" }),
    rec({ id: "nube", monto: "10", moneda: "USD", dias: "3", categoria: "comida" }), // 600 al mes
    rec({ id: "fondo", tipo: "transferencia", monto: "2000", dias: "20", destino: "ahorro", categoria: "inversion" }),
    rec({ id: "visa", tipo: "pago_tarjeta", pagoTotal: true, monto: "0", destino: "visa", dias: "28" }),
  ],
  movimientos: [
    mov({ id: "1", fecha: "2026-10-15", tipo: "ingreso", monto: "40000", categoria: "sueldo", recurrenteId: "quincena" }),
    mov({ id: "2", fecha: "2026-10-02", monto: "18000", categoria: "alquiler", recurrenteId: "alq" }),
    mov({ id: "3", fecha: "2026-10-04", monto: "2500.50", categoria: "comida" }),
    mov({ id: "4", fecha: "2026-10-06", monto: "20", moneda: "USD", tasa: "59.5", categoria: "comida" }), // 1,190
    mov({ id: "5", fecha: "2026-10-07", tipo: "ingreso", monto: "300", categoria: "comida" }), // reembolso: resta del gasto
    mov({ id: "6", fecha: "2026-10-08", monto: "1500", categoria: "mercancia" }),
    mov({ id: "7", fecha: "2026-10-09", monto: "850", categoria: "intereses" }),
    mov({ id: "8", fecha: "2026-10-10", tipo: "ingreso", monto: "2500", categoria: "regalo" }),
    mov({ id: "9", fecha: "2026-10-11", monto: "700", categoria: "multa" }),
    mov({ id: "10", fecha: "2026-10-20", tipo: "transferencia", monto: "2000", destino: "ahorro", categoria: "inversion", recurrenteId: "fondo" }),
    mov({ id: "11", fecha: "2026-10-21", tipo: "transferencia", monto: "999", destino: "visa" }), // entre cuentas: no cuenta
    mov({ id: "12", fecha: "2026-09-30", monto: "50000", categoria: "comida" }), // otro mes
  ],
});

describe("estado de resultados", () => {
  const e = estadoDeResultados(COMPLETO, "2026-10");

  it("presupuestado = fijos del mes + adicional, por línea", () => {
    const linea = (t: keyof typeof e.secciones, id: string) => e.secciones[t].lineas.find((l) => l.clave === id)!;
    expect(linea("ingreso", "sueldo")).toMatchObject({ fijos: "80000", adicional: "0", presupuestado: "80000" });
    expect(linea("gasto", "comida")).toMatchObject({ fijos: "600", adicional: "12000", presupuestado: "12600" });
    expect(linea("ahorro_inversion", "inversion")).toMatchObject({ fijos: "2000", adicional: "4000", presupuestado: "6000" });
    expect(e.secciones.ingreso.presupuestado).toBe("85000");
    expect(e.secciones.costo.presupuestado).toBe("3000");
    expect(e.secciones.gasto.presupuestado).toBe("30600");
    expect(e.secciones.gasto_financiero.presupuestado).toBe("1000");
    expect(e.secciones.otro_ingreso.presupuestado).toBe("2000");
    expect(e.secciones.otro_gasto.presupuestado).toBe("0");
    // «Pagar todo lo que debas» es entre cuentas: no entra al estado (ni se inventa su monto).
    expect(e.sinTasa).toBe(0);
  });

  it("subtotales y signos: bruta, operativa, neta, gastos totales y disponible", () => {
    expect(e.utilidadBruta.presupuestado).toBe("82000"); // 85,000 − 3,000
    expect(e.utilidadOperativa.presupuestado).toBe("51400"); // − 30,600
    expect(e.utilidadNeta.presupuestado).toBe("52400"); // − 1,000 + 2,000 − 0
    expect(e.gastosTotales.presupuestado).toBe("34600");
    expect(e.disponible.presupuestado).toBe("46400"); // − 6,000 de ahorro

    expect(e.secciones.ingreso.real).toBe("40000");
    expect(e.secciones.costo.real).toBe("1500");
    expect(e.secciones.gasto.real).toBe("21390.5"); // 18,000 + 2,500.50 + 1,190 − 300
    expect(e.secciones.gasto_financiero.real).toBe("850");
    expect(e.secciones.otro_ingreso.real).toBe("2500");
    expect(e.secciones.otro_gasto.real).toBe("700");
    expect(e.utilidadBruta.real).toBe("38500");
    expect(e.utilidadOperativa.real).toBe("17109.5");
    expect(e.utilidadNeta.real).toBe("18059.5"); // − 850 + 2,500 − 700
    expect(e.secciones.ahorro_inversion.real).toBe("2000");
    expect(e.disponible.real).toBe("16059.5");
  });

  it("diferencia siempre «a favor» positiva y % de cumplimiento", () => {
    // Ingresos: entró menos de lo planificado → en contra.
    expect(e.secciones.ingreso).toMatchObject({ diferencia: "-45000", cumplimiento: "47" });
    // Gastos: gastaste menos → a favor.
    expect(e.secciones.gasto).toMatchObject({ diferencia: "9209.5", cumplimiento: "70" });
    // Otros gastos sin presupuesto: en contra y sin % (no hay con qué comparar).
    expect(e.secciones.otro_gasto).toMatchObject({ diferencia: "-700", cumplimiento: null });
    // Ahorro: apartar menos de lo planificado es en contra.
    expect(e.secciones.ahorro_inversion.diferencia).toBe("-4000");
    expect(e.utilidadNeta.diferencia).toBe("-34340.5");
    expect(cifras(new Big(100), new Big(150), "gasto")).toMatchObject({ diferencia: "-50", cumplimiento: "150" });
    expect(cifras(new Big(0), new Big(0), "utilidad")).toMatchObject({ diferencia: "0", cumplimiento: null });
  });

  it("lo que no tiene categoría no se pierde: cae en «Sin categoría» y se cuenta", () => {
    const d = datos({
      categorias: [cat("comida", "gasto")],
      recurrentes: [rec({ id: "sueldo", tipo: "ingreso", monto: "30000", dias: "30" }), rec({ id: "luz", monto: "2000", dias: "5" })],
      movimientos: [mov({ id: "a", monto: "450" }), mov({ id: "b", monto: "100", categoria: "borrada" }), mov({ id: "c", tipo: "transferencia", monto: "800", destino: "ahorro" })],
    });
    const r = estadoDeResultados(d, "2026-10");
    expect(r.secciones.ingreso.lineas.find((l) => l.clave === SIN_CATEGORIA_INGRESO)).toMatchObject({ especial: true, presupuestado: "30000", real: "0" });
    expect(r.secciones.gasto.lineas.find((l) => l.clave === SIN_CATEGORIA_GASTO)).toMatchObject({ presupuestado: "2000", real: "550" });
    expect(r.secciones.ahorro_inversion.lineas.find((l) => l.clave === A_CUENTAS_DE_AHORRO)).toMatchObject({ real: "800" });
    expect(r.sinCategoria).toEqual({ recurrentes: 2, movimientos: 2 });
    expect(r.utilidadNeta).toMatchObject({ presupuestado: "28000", real: "-550" });
  });

  it("mes sin datos: todo en cero, sin % y marcado vacío", () => {
    const r = estadoDeResultados(datos({ categorias: [cat("sueldo", "ingreso")] }), "2027-01");
    expect(r.vacio).toBe(true);
    expect(r.utilidadNeta).toEqual({ presupuestado: "0", real: "0", diferencia: "0", cumplimiento: null });
    expect(r.secciones.ingreso.lineas).toHaveLength(1);
    expect(r.secciones.costo.lineas).toEqual([]);
    expect(estadoDeResultados(COMPLETO, "2026-10").vacio).toBe(false);
  });

  it("US$ sin tasa no se suma y se avisa", () => {
    const d = datos({ tasasUSD: null, categorias: [cat("c", "gasto")], movimientos: [mov({ id: "u", moneda: "USD", monto: "5", categoria: "c" })] });
    const r = estadoDeResultados(d, "2026-10");
    expect(r.secciones.gasto.real).toBe("0");
    expect(r.sinTasa).toBe(1);
  });

  it("lo programado que falta del mes (pendiente) sale de la simulación", () => {
    const sim = simular(COMPLETO, { hoy: "2026-10-22", hasta: "2026-10-31" });
    const r = estadoDeResultados(COMPLETO, "2026-10", { sim });
    // La quincena del 30 todavía no ocurre: está pendiente.
    expect(r.secciones.ingreso.lineas.find((l) => l.clave === "sueldo")!.pendiente).toBe("40000");
    expect(r.secciones.gasto.lineas.find((l) => l.clave === "alquiler")!.pendiente).toBe("0");
  });

  it("presupuesto mensual de ahorro (contrato del Portafolio)", () => {
    expect(presupuestoAhorroMensual(COMPLETO, "2026-10")).toBe("6000");
    expect(presupuestoAhorroMensual(datos(), "2026-10")).toBe("0");
  });
});

describe("fijos del mes", () => {
  it("cuenta las veces que cae cada fijo y respeta pausa, desde/hasta y el último día del mes", () => {
    const d = datos({
      recurrentes: [
        rec({ id: "fin", dias: "31", monto: "10" }),
        rec({ id: "dos", dias: "15, 30", monto: "10" }),
        rec({ id: "pausa", activo: false }),
        rec({ id: "cada", frecuencia: "cada_n", cadaN: 7, desde: "2026-02-02", monto: "1" }),
        rec({ id: "luego", desde: "2026-03-01" }),
      ],
    });
    const f = new Map(fijosDelMes(d, "2026-02").map((x) => [x.recurrente.id, x]));
    expect(f.get("fin")).toMatchObject({ veces: 1, totalDOP: "10" }); // el 31 cae el 28
    expect(f.get("dos")).toMatchObject({ veces: 2, totalDOP: "20" }); // el 30 cae el 28
    expect(f.has("pausa")).toBe(false);
    expect(f.get("cada")).toMatchObject({ veces: 4 }); // 2, 9, 16 y 23
    expect(f.has("luego")).toBe(false);
  });
});

describe("conversión de la versión anterior", () => {
  it("el presupuesto total pasa a adicional descontando los fijos mensuales en RD$", () => {
    const fijos = [rec({ id: "a", monto: "22000", dias: "1" }), rec({ id: "b", monto: "500", dias: "15, 30" }), rec({ id: "u", monto: "9", moneda: "USD" })];
    expect(adicionalDesdeV1("25000", fijos)).toBe("2000"); // 25,000 − 22,000 − 1,000
    expect(adicionalDesdeV1("22000", fijos.slice(0, 1))).toBeNull(); // el asistente viejo: presupuesto = el fijo
    expect(adicionalDesdeV1("12000.5", [])).toBe("12000.5");
    expect(adicionalDesdeV1(null, fijos)).toBeNull();
    expect(adicionalDesdeV1("0", [])).toBeNull();
  });

  it("ancho de barra con tope", () => {
    expect(anchoBarra("50", "200")).toBe(25);
    expect(anchoBarra("500", "200")).toBe(100);
    expect(anchoBarra("5", "0")).toBe(0);
  });
});
