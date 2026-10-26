// Registro único: saldo vigente, balance, sugerencias de repetidas y el asistente del Presupuesto
// eligiendo del Portafolio. Datos SINTÉTICOS (cifras redondas inventadas).

import { describe, expect, it } from "vitest";
import { armarDesdeAsistente } from "../caja/asistente";
import { aJsonSQL } from "../caja/importar";
import type { DatosCaja } from "../caja/tipos";
import { contextoEjemplo } from "./apoyo-pruebas";
import { balance, conSaldosVigentes, cuentasParaPresupuesto, filaARegistro, type ItemRegistro, palabrasClave, sugerirUniones } from "./registro";

function item(id: string, clase: string, cantidad: string, extra: Record<string, unknown> = {}, cajaId: string | null = null): ItemRegistro {
  return filaARegistro({ id, clase, nombre: id, institucion: "", moneda: "DOP", cantidad, precio: "1", tasa: "0", origen: "portafolio", orden: 0, ...extra }, cajaId);
}

const caja = (): DatosCaja => ({
  config: { inicio: "2026-10-01", colchon: "0", margen: "0", tasaUSD: "60" },
  cuentas: [
    { id: "b", nombre: "Banco", tipo: "banco", saldoInicial: "10000", limite: null, orden: 1 },
    { id: "v", nombre: "Visa", tipo: "tarjeta", saldoInicial: "500", limite: "20000", orden: 2 },
  ],
  categorias: [],
  recurrentes: [
    { id: "r", nombre: "Quincena", tipo: "ingreso", monto: "30000", moneda: "DOP", pagoTotal: false, cuenta: "b", destino: null, categoria: null, frecuencia: "mensual", dias: "15", cadaN: null, fecha: null, desde: null, hasta: null, activo: true },
  ],
  movimientos: [
    { id: "m1", fecha: "2026-10-03", tipo: "gasto", monto: "1500", moneda: "DOP", tasa: null, cuenta: "b", destino: null, categoria: null, nota: null, recurrenteId: null },
    { id: "m2", fecha: "2026-10-04", tipo: "gasto", monto: "10", moneda: "USD", tasa: null, cuenta: "v", destino: null, categoria: null, nota: null, recurrenteId: null },
    { id: "m3", fecha: "2026-10-30", tipo: "gasto", monto: "999", moneda: "DOP", tasa: null, cuenta: "b", destino: null, categoria: null, nota: "futuro", recurrenteId: null },
  ],
  omitidos: [],
  saldos: [],
  notas: [],
  // Dólar del BCRD inventado: 60 el 2 de octubre (vale para el gasto del 4).
  tasasUSD: { hoy: "2026-10-20", serie: [{ fecha: "2026-10-02", valor: "60", url: null }] },
});

describe("saldo vigente: lo escrito + lo anotado en el Presupuesto", () => {
  it("usa la línea de tiempo del Presupuesto sin fijos sin confirmar ni movimientos futuros", () => {
    const items = conSaldosVigentes([item("rb", "ahorros", "10000", {}, "b"), item("rv", "tarjeta", "500", {}, "v"), item("x", "rentafija", "5000")], caja(), "2026-10-20");
    expect(items.map((i) => [i.id, i.cantidad, i.vigente.fuente])).toEqual([
      ["rb", "8500", "presupuesto"], // la quincena del 15 no se confirmó: no cuenta
      ["rv", "1100", "presupuesto"], // deuda: 500 + US$ 10 × 60
      ["x", "5000", "escrito"],
    ]);
    expect(items[0].cantidadEscrita).toBe("10000");
  });

  it("un cuadre con el banco manda desde ese día", () => {
    const c = caja();
    c.saldos = [{ fecha: "2026-10-10", cuentaId: "b", saldo: "7000" }];
    expect(conSaldosVigentes([item("rb", "ahorros", "10000", {}, "b")], c, "2026-10-20")[0].cantidad).toBe("7000");
  });

  it("sin Presupuesto configurado, queda lo escrito", () => {
    expect(conSaldosVigentes([item("rb", "ahorros", "10000", {}, "b")], { ...caja(), config: null }, "2026-10-20")[0].cantidad).toBe("10000");
  });
});

describe("balance personal", () => {
  it("patrimonio = inversiones + otros activos − deudas; las archivadas no cuentan", () => {
    const ctx = contextoEjemplo();
    const b = balance(ctx, [
      item("a", "ahorros", "50000"),
      item("u", "ahorros", "1000", { moneda: "USD" }),
      item("car", "otros", "400000", { subtipo: "vehiculo" }),
      item("tc", "tarjeta", "12000", { saldo_fecha: "2026-10-01" }),
      item("p", "prestamo", "300000", { saldo_fecha: "2026-10-01" }),
      item("tc2", "tarjeta", "0"),
      item("vieja", "ahorros", "99999", { unido_a: "a" }),
    ]);
    expect(b.inversiones.toFixed()).toBe("110000");
    expect(b.otros.toFixed()).toBe("400000");
    expect(b.deudas.toFixed()).toBe("312000");
    expect(b.patrimonio.toFixed()).toBe("198000");
    expect(b.deudasSinDato.map((i) => i.id)).toEqual(["tc2"]);
  });
});

describe("unir cuentas repetidas: sugerencias", () => {
  it("palabras clave sin relleno ni acentos", () => {
    expect(palabrasClave("Cuenta de Ahorros Popular")).toEqual(["popular"]);
    expect(palabrasClave("Tarjeta Crédito BHD León")).toEqual(["bhd", "leon"]);
  });

  it("no sugiere entre monedas distintas, ni deuda con activo, ni lo descartado", () => {
    const p = (id: string, clase: string, nombre: string, extra = {}) => item(id, clase, "1", { nombre, origen: "presupuesto", ...extra });
    const q = (id: string, clase: string, nombre: string, extra = {}) => item(id, clase, "1", { nombre, ...extra });
    const lista = [p("p1", "ahorros", "Popular"), q("q1", "ahorros", "Popular", { moneda: "USD" }), q("q2", "tarjeta", "Popular"), p("p2", "tarjeta", "Visa BHD"), q("q3", "tarjeta", "Visa BHD")];
    expect(sugerirUniones(lista).map((x) => `${x.presupuesto.id}|${x.portafolio.id}`)).toEqual(["p2|q3"]);
    expect(sugerirUniones(lista, new Set(["p2|q3"]))).toEqual([]);
  });
});

describe("asistente del Presupuesto: elige del Portafolio, no vuelve a pedir nada", () => {
  it("una cuenta elegida toma nombre, tipo y saldo del registro y viaja con su registro_id", () => {
    const items = [item("pop", "ahorros", "25000", { nombre: "Popular", subtipo: "corriente" }), item("usd", "ahorros", "100", { moneda: "USD" }), item("acc", "rentavariable", "2", { precio: "100" })];
    const registro = cuentasParaPresupuesto(items);
    // Desde la Fase F, una cuenta en US$ también sirve (con su moneda); las acciones, no.
    expect(registro.map((r) => [r.id, r.tipo, r.saldo, r.moneda ?? "DOP"])).toEqual([["pop", "banco", "25000", "DOP"], ["usd", "ahorro", "100", "USD"]]);
    let n = 0;
    const r = armarDesdeAsistente(
      { ingresos: [{ nombre: "Sueldo", tipo: "ingreso", monto: "50000", dias: "30" }], gastos: [], cuentas: [{ nombre: "", tipo: "banco", saldo: "", registroId: "pop" }], cuentaIngresos: -1, cuentaGastos: -1, ahorro: "", colchon: "0" },
      "2026-10-20",
      { config: null, cuentas: [], categorias: [], recurrentes: [], movimientos: [], omitidos: [], saldos: [], notas: [] },
      () => `id${++n}`,
      registro,
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.valor.cuentas).toEqual([{ id: "id2", nombre: "Popular", tipo: "banco", saldoInicial: "25000", limite: null, orden: 0, registroId: "pop" }]);
    expect(r.valor.recurrentes[0].cuenta).toBe("id2");
    expect(aJsonSQL(r.valor).cuentas[0]).toMatchObject({ registro_id: "pop" });
  });

  it("si la cuenta elegida ya no está en el Portafolio, lo dice", () => {
    const r = armarDesdeAsistente(
      { ingresos: [], gastos: [], cuentas: [{ nombre: "", tipo: "banco", saldo: "", registroId: "x" }], cuentaIngresos: -1, cuentaGastos: -1, ahorro: "", colchon: "0" },
      "2026-10-20",
      { config: null, cuentas: [], categorias: [], recurrentes: [], movimientos: [], omitidos: [], saldos: [], notas: [] },
      () => "id",
      [],
    );
    expect(r.ok ? "" : r.error).toMatch(/ya no está en tu Portafolio/);
  });
});
