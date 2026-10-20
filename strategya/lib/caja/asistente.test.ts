import { describe, expect, it } from "vitest";
import { armarDesdeAsistente, type Asistente, CATEGORIAS_DIARIAS, leerAsistente, totalMensual } from "./asistente";
import { horizonte, resumir, simular } from "./motor";
import type { DatosCaja } from "./tipos";

const VACIO: DatosCaja = { config: null, cuentas: [], categorias: [], recurrentes: [], movimientos: [], omitidos: [], saldos: [], notas: [] };
const hoy = "2026-10-20";
const ids = () => {
  let n = 0;
  return () => `id-${++n}`;
};

const BASE: Asistente = {
  cuentas: [
    { nombre: "Banco A", tipo: "banco", saldo: "48,250.75" },
    { nombre: "Cartera", tipo: "efectivo", saldo: "3500" },
    { nombre: "Visa", tipo: "tarjeta", saldo: "12400", limite: "80000", diaPago: "28" },
  ],
  ingresos: [{ nombre: "Quincena", monto: "42,000", dias: "15, 30", cuenta: 0 }],
  gastos: [
    { nombre: "Alquiler", monto: "22000", dia: "1", cuenta: 0 },
    { nombre: "Internet", monto: "2100", dia: "10", cuenta: 2 },
    { nombre: "", monto: "", dia: "", cuenta: 0 },
  ],
  colchon: "10,000",
};

describe("asistente de bienvenida", () => {
  it("arma cuentas, recurrentes, categorías y configuración con montos exactos", () => {
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
    const [quincena, alquiler, internet, pago] = d.recurrentes;
    expect(quincena).toMatchObject({ nombre: "Quincena", tipo: "ingreso", monto: "42000", dias: "15, 30", cuenta: d.cuentas[0].id });
    expect(alquiler).toMatchObject({ tipo: "gasto", monto: "22000", dias: "1", cuenta: d.cuentas[0].id });
    expect(internet).toMatchObject({ tipo: "gasto", cuenta: d.cuentas[2].id });
    expect(pago).toMatchObject({ nombre: "Pago Visa", tipo: "pago_tarjeta", pagoTotal: true, cuenta: d.cuentas[0].id, destino: d.cuentas[2].id, dias: "28" });
    expect(d.recurrentes).toHaveLength(4); // la fila vacía se ignora
    const cat = (id: string | null) => d.categorias.find((c) => c.id === id);
    expect(cat(alquiler.categoria)).toMatchObject({ nombre: "Alquiler", grupo: "fijo", presupuesto: "22000" });
    expect(cat(quincena.categoria)).toMatchObject({ grupo: "ingreso", presupuesto: null });
    for (const n of CATEGORIAS_DIARIAS) expect(d.categorias.some((c) => c.nombre === n && c.presupuesto === null)).toBe(true);
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

  it("errores que dicen cómo arreglarlo", () => {
    const sinCuentas = armarDesdeAsistente({ ...BASE, cuentas: [] }, hoy, VACIO, ids());
    expect(sinCuentas).toEqual({ ok: false, error: expect.stringContaining("Paso 1: agrega al menos una cuenta") });
    const saldoMalo = armarDesdeAsistente({ ...BASE, cuentas: [{ nombre: "Banco A", tipo: "banco", saldo: "mucho" }] }, hoy, VACIO, ids());
    expect(saldoMalo).toEqual({ ok: false, error: "Paso 1, «Banco A»: «mucho» no es un número. Escribe solo la cifra, por ejemplo 25,000.50." });
    const dias = armarDesdeAsistente({ ...BASE, ingresos: [{ nombre: "Sueldo", monto: "5000", dias: "40", cuenta: 0 }] }, hoy, VACIO, ids());
    expect(dias).toEqual({ ok: false, error: expect.stringContaining("separados por coma (por ejemplo 15, 30)") });
    const dia = armarDesdeAsistente({ ...BASE, gastos: [{ nombre: "Luz", monto: "3000", dia: "", cuenta: 0 }] }, hoy, VACIO, ids());
    expect(dia).toEqual({ ok: false, error: "Paso 3, «Luz»: escribe el día del mes en que lo pagas (un número del 1 al 31)." });
    const colchon = armarDesdeAsistente({ ...BASE, colchon: "" }, hoy, VACIO, ids());
    expect(colchon).toEqual({ ok: false, error: expect.stringContaining("Si no quieres colchón, escribe 0") });
    const soloTarjeta = armarDesdeAsistente({ ...BASE, cuentas: [BASE.cuentas[2]], ingresos: [], gastos: [] }, hoy, VACIO, ids());
    expect(soloTarjeta).toEqual({ ok: false, error: expect.stringContaining("agrega también una cuenta de banco o efectivo") });
  });

  it("conserva lo que ya existía y no duplica categorías", () => {
    const previo: DatosCaja = { ...VACIO, cuentas: [{ id: "x", nombre: "Vieja", tipo: "banco", saldoInicial: "1", limite: null, orden: 4 }], categorias: [{ id: "k", nombre: "Comida", grupo: "variable", presupuesto: "9000" }] };
    const r = armarDesdeAsistente(BASE, hoy, previo, ids());
    if (!r.ok) throw new Error(r.error);
    expect(r.valor.cuentas[0].id).toBe("x");
    expect(r.valor.cuentas[1].orden).toBe(5);
    expect(r.valor.categorias.filter((c) => c.nombre === "Comida")).toHaveLength(1);
  });

  it("lee el JSON del formulario: solo texto, nunca números de JSON para montos", () => {
    const r = leerAsistente(JSON.stringify({ cuentas: [{ nombre: " Banco ", tipo: "banco", saldo: 100.1 }], ingresos: [], gastos: [], colchon: "0" }));
    expect(r.ok && r.valor.cuentas[0]).toEqual({ nombre: "Banco", tipo: "banco", saldo: "", limite: "", diaPago: "" });
    expect(leerAsistente("{")).toMatchObject({ ok: false });
    expect(leerAsistente(JSON.stringify({ cuentas: [{ tipo: "cripto" }] }))).toMatchObject({ ok: false });
  });

  it("total al mes de un ingreso con varios días", () => {
    expect(totalMensual("42,000", "15, 30")).toBe("84000");
    expect(totalMensual("abc", "15")).toBeNull();
    expect(totalMensual("100", "")).toBeNull();
  });
});
