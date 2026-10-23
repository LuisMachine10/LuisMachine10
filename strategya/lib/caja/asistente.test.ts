import { describe, expect, it } from "vitest";
import { alMes, armarDesdeAsistente, type Asistente, CATEGORIAS_DIARIAS, leerAsistente, NOMBRE_AHORRO, totalMensual } from "./asistente";
import { horizonte, resumir, simular } from "./motor";
import { estadoDeResultados } from "./resultados";
import type { DatosCaja } from "./tipos";

// Datos de ejemplo inventados para las pruebas (no son de Mena).
const VACIO: DatosCaja = { config: null, cuentas: [], categorias: [], recurrentes: [], movimientos: [], omitidos: [], saldos: [], notas: [] };
const hoy = "2026-10-20";
const ids = () => {
  let n = 0;
  return () => `id-${++n}`;
};

const BASE: Asistente = {
  ingresos: [
    { nombre: "Quincena", tipo: "ingreso", monto: "42,000", dias: "15, 30" },
    { nombre: "Ventas", tipo: "ingreso", monto: "8000", dias: "" },
  ],
  gastos: [
    { nombre: "Alquiler", tipo: "gasto", monto: "22000", dias: "1" },
    { nombre: "Internet", tipo: "gasto", monto: "2100", dias: "10" },
    { nombre: "Comida", tipo: "gasto", monto: "12,000", dias: "" },
    { nombre: "Mercancía", tipo: "costo", monto: "3000", dias: "" },
    { nombre: "Intereses de la tarjeta", tipo: "gasto_financiero", monto: "900", dias: "" },
    { nombre: "", tipo: "gasto", monto: "", dias: "" },
  ],
  cuentas: [
    { nombre: "Banco A", tipo: "banco", saldo: "48,250.75" },
    { nombre: "Cartera", tipo: "efectivo", saldo: "3500" },
    { nombre: "Visa", tipo: "tarjeta", saldo: "12400", limite: "80000", diaPago: "28" },
  ],
  cuentaIngresos: 0,
  cuentaGastos: 2,
  ahorro: "5,000",
  colchon: "10,000",
};

describe("asistente de bienvenida (1 ingresos · 2 costos y gastos · 3 cuentas · 4 ahorro y colchón)", () => {
  it("cada ingreso o gasto es una categoría; con día, además un fijo enlazado a ella", () => {
    const r = armarDesdeAsistente(BASE, hoy, VACIO, ids());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = r.valor;
    expect(d.config).toEqual({ inicio: hoy, colchon: "10000", margen: "3000", tasaUSD: null });
    expect(d.cuentas.map((c) => [c.nombre, c.tipo, c.saldoInicial, c.limite, c.orden])).toEqual([
      ["Banco A", "banco", "48250.75", null, 0],
      ["Cartera", "efectivo", "3500", null, 1],
      ["Visa", "tarjeta", "12400", "80000", 2],
    ]);
    const cat = (nombre: string) => d.categorias.find((c) => c.nombre === nombre)!;
    expect(cat("Quincena")).toMatchObject({ tipo: "ingreso", adicional: null });
    expect(cat("Ventas")).toMatchObject({ tipo: "ingreso", adicional: "8000" });
    expect(cat("Comida")).toMatchObject({ tipo: "gasto", adicional: "12000" });
    expect(cat("Mercancía")).toMatchObject({ tipo: "costo", adicional: "3000" });
    expect(cat("Intereses de la tarjeta")).toMatchObject({ tipo: "gasto_financiero", adicional: "900" });
    expect(cat(NOMBRE_AHORRO)).toMatchObject({ tipo: "ahorro_inversion", adicional: "5000" });
    for (const n of CATEGORIAS_DIARIAS.filter((x) => x !== "Comida")) expect(cat(n)).toMatchObject({ tipo: "gasto", adicional: null });
    expect(d.categorias.filter((c) => c.nombre === "Comida")).toHaveLength(1); // no se duplica con la diaria

    const [quincena, alquiler, internet, pago] = d.recurrentes;
    expect(d.recurrentes).toHaveLength(4); // la fila vacía se ignora; los sin día no son fijos
    expect(quincena).toMatchObject({ nombre: "Quincena", tipo: "ingreso", monto: "42000", dias: "15, 30", cuenta: d.cuentas[0].id, categoria: cat("Quincena").id });
    expect(alquiler).toMatchObject({ tipo: "gasto", monto: "22000", dias: "1", cuenta: d.cuentas[2].id, categoria: cat("Alquiler").id });
    expect(internet).toMatchObject({ categoria: cat("Internet").id });
    expect(pago).toMatchObject({ nombre: "Pago Visa", tipo: "pago_tarjeta", pagoTotal: true, cuenta: d.cuentas[0].id, destino: d.cuentas[2].id, dias: "28", categoria: null });
  });

  it("apenas termina, el estado de resultados ya tiene lo presupuestado (sin anotar dos veces)", () => {
    const r = armarDesdeAsistente(BASE, hoy, VACIO, ids());
    if (!r.ok) throw new Error(r.error);
    const e = estadoDeResultados(r.valor, "2026-10");
    expect(e.secciones.ingreso.presupuestado).toBe("92000"); // 42,000 × 2 + 8,000
    expect(e.secciones.costo.presupuestado).toBe("3000");
    expect(e.secciones.gasto.presupuestado).toBe("36100"); // 22,000 + 2,100 + 12,000
    expect(e.secciones.gasto_financiero.presupuestado).toBe("900");
    expect(e.utilidadNeta.presupuestado).toBe("52000");
    expect(e.secciones.ahorro_inversion.presupuestado).toBe("5000");
    expect(e.disponible.presupuestado).toBe("47000");
    expect(e.utilidadNeta.real).toBe("0");
  });

  it("el calendario funciona apenas termina: simula desde hoy con lo escrito", () => {
    const r = armarDesdeAsistente(BASE, hoy, VACIO, ids());
    if (!r.ok) throw new Error(r.error);
    const sim = simular(r.valor, { hoy, hasta: horizonte("2026-10", hoy) });
    const res = resumir(sim, r.valor.config);
    expect(res.disponibleHoy).toBe("51750.75"); // banco + efectivo
    expect(res.deudaTarjetas).toBe("12400");
    expect(sim.porFecha.get("2026-10-30")!.tieneIngreso).toBe(true);
  });

  it("errores que dicen cómo arreglarlo, con el paso", () => {
    const sinCuentas = armarDesdeAsistente({ ...BASE, cuentas: [] }, hoy, VACIO, ids());
    expect(sinCuentas).toEqual({ ok: false, error: expect.stringContaining("Paso 3: agrega al menos una cuenta") });
    const saldoMalo = armarDesdeAsistente({ ...BASE, cuentas: [{ nombre: "Banco A", tipo: "banco", saldo: "mucho" }] }, hoy, VACIO, ids());
    expect(saldoMalo).toEqual({ ok: false, error: "Paso 3, «Banco A»: «mucho» no es un número. Escribe solo la cifra, por ejemplo 25,000.50." });
    const dias = armarDesdeAsistente({ ...BASE, ingresos: [{ nombre: "Sueldo", tipo: "ingreso", monto: "5000", dias: "40" }] }, hoy, VACIO, ids());
    expect(dias).toEqual({ ok: false, error: expect.stringContaining("Paso 1, «Sueldo»: escribe los días del mes en que te pagan") });
    const sinMonto = armarDesdeAsistente({ ...BASE, gastos: [{ nombre: "Luz", tipo: "gasto", monto: "", dias: "5" }] }, hoy, VACIO, ids());
    expect(sinMonto).toEqual({ ok: false, error: "Paso 2, «Luz»: escribe el monto, por ejemplo 15,000." });
    const sinNombre = armarDesdeAsistente({ ...BASE, gastos: [{ nombre: "", tipo: "gasto", monto: "10", dias: "" }] }, hoy, VACIO, ids());
    expect(sinNombre).toEqual({ ok: false, error: expect.stringContaining("Paso 2, gasto 1: ponle un nombre") });
    const ahorro = armarDesdeAsistente({ ...BASE, ahorro: "mucho" }, hoy, VACIO, ids());
    expect(ahorro).toEqual({ ok: false, error: expect.stringContaining("Paso 4, ahorro e inversión") });
    const colchon = armarDesdeAsistente({ ...BASE, colchon: "" }, hoy, VACIO, ids());
    expect(colchon).toEqual({ ok: false, error: expect.stringContaining("Si no quieres colchón, escribe 0") });
    const soloTarjeta = armarDesdeAsistente({ ...BASE, cuentas: [BASE.cuentas[2]], ingresos: [], gastos: [] }, hoy, VACIO, ids());
    expect(soloTarjeta).toEqual({ ok: false, error: expect.stringContaining("agrega también una cuenta de banco o efectivo") });
  });

  it("conserva lo que ya existía, no duplica categorías y no toca lo recibido", () => {
    const previo: DatosCaja = {
      ...VACIO,
      cuentas: [{ id: "x", nombre: "Vieja", tipo: "banco", saldoInicial: "1", limite: null, orden: 4 }],
      categorias: [{ id: "k", nombre: "Comida", tipo: "gasto", adicional: "9000" }],
    };
    const r = armarDesdeAsistente(BASE, hoy, previo, ids());
    if (!r.ok) throw new Error(r.error);
    expect(r.valor.cuentas[0].id).toBe("x");
    expect(r.valor.cuentas[1].orden).toBe(5);
    const comida = r.valor.categorias.filter((c) => c.nombre === "Comida");
    expect(comida).toEqual([{ id: "k", nombre: "Comida", tipo: "gasto", adicional: "21000" }]);
    expect(previo.categorias[0].adicional).toBe("9000");
  });

  it("lee el JSON del formulario: solo texto, nunca números de JSON para montos", () => {
    const r = leerAsistente(JSON.stringify({ cuentas: [{ nombre: " Banco ", tipo: "banco", saldo: 100.1 }], ingresos: [{ nombre: "S", monto: "1" }], gastos: [], colchon: "0", cuentaIngresos: "0" }));
    expect(r.ok && r.valor.cuentas[0]).toEqual({ nombre: "Banco", tipo: "banco", saldo: "", limite: "", diaPago: "" });
    expect(r.ok && r.valor.ingresos[0]).toEqual({ nombre: "S", tipo: "ingreso", monto: "1", dias: "" });
    expect(r.ok && [r.valor.cuentaIngresos, r.valor.cuentaGastos]).toEqual([0, -1]);
    expect(leerAsistente("{")).toMatchObject({ ok: false });
    expect(leerAsistente(JSON.stringify({ cuentas: [{ tipo: "cripto" }] }))).toMatchObject({ ok: false });
    // Un gasto no puede llegar con tipo de ingreso.
    expect(leerAsistente(JSON.stringify({ gastos: [{ nombre: "x", tipo: "ingreso" }] }))).toMatchObject({ ok: false });
  });

  it("totales al mes", () => {
    expect(totalMensual("42,000", "15, 30")).toBe("84000");
    expect(totalMensual("abc", "15")).toBeNull();
    expect(totalMensual("100", "")).toBeNull();
    expect(alMes("12,000", "")).toBe("12000");
    expect(alMes("1000", "5")).toBe("1000");
  });
});
