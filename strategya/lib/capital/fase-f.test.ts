// Fase F en el Portafolio: aportes (omitir, meses anteriores), reubicar la parte de un vencido y la
// revisión de la conexión con el Presupuesto. Datos SINTÉTICOS (cifras redondas inventadas).

import Big from "big.js";
import { describe, expect, it } from "vitest";
import type { DatosCaja } from "../caja/tipos";
import { aportesDeMes, conOmision, leerPrefAportes, partesVencidas, pendientesAnteriores, reubicarParte, sinOmision } from "./aportes";
import { activosEjemplo, contextoEjemplo } from "./apoyo-pruebas";
import { revisarConexion } from "./conexion";
import { aportesDelPlan } from "./proyeccion";
import { conSaldosVigentes, filaARegistro } from "./registro";

const AHORRO = new Big(10000);
// Meta de la política del ejemplo: efectivo 10 %, ahorros 10 % (2 cuentas), renta fija 50 %, renta variable 30 %.

/** Presupuesto mínimo que aparta RD$ 10,000 de ahorro cada mes desde agosto. */
function caja(extra: Partial<DatosCaja> = {}): DatosCaja {
  return {
    config: { inicio: "2026-08-01", colchon: "0", margen: "0", tasaUSD: null },
    cuentas: [{ id: "b", nombre: "Banco", tipo: "banco", saldoInicial: "50000", limite: null, orden: 0 }],
    categorias: [{ id: "h", nombre: "Ahorro", tipo: "ahorro_inversion", adicional: "10000" }],
    recurrentes: [],
    movimientos: [],
    omitidos: [],
    saldos: [],
    notas: [],
    ...extra,
  };
}

describe("aportes del mes: hecho, omitido o pendiente", () => {
  it("«Omitir este mes» cuenta como respondido y guarda el motivo", () => {
    const ctx = contextoEjemplo();
    let pref = conOmision({ omitidos: [] }, { activoId: "a4", mes: "2026-10", motivo: "pagué el seguro", fecha: "2026-10-15" });
    const ap = aportesDeMes(ctx, "2026-10", AHORRO, [{ activoId: "a1", mes: "2026-10", fecha: "2026-10-02", monto: "1000" }], pref);
    expect(Object.fromEntries(ap.map((x) => [x.activo.id, x.estado]))).toEqual({ a1: "hecho", a2: "pendiente", a3: "pendiente", a4: "omitido", a5: "pendiente" });
    expect(ap.find((x) => x.activo.id === "a4")?.omision?.motivo).toBe("pagué el seguro");
    pref = sinOmision(pref, "a4", "2026-10");
    expect(aportesDeMes(ctx, "2026-10", AHORRO, [], pref).find((x) => x.activo.id === "a4")?.estado).toBe("pendiente");
  });

  it("la preferencia se lee con cuidado: descarta lo que no sirve, sin cifras", () => {
    const p = leerPrefAportes({ omitidos: [{ activoId: "a1", mes: "2026-09", motivo: " ", fecha: "2026-10-01" }, { activoId: "x y", mes: "2026-09" }, { activoId: "a2", mes: "2026-13" }, 7] });
    expect(p.omitidos).toEqual([{ activoId: "a1", mes: "2026-09", motivo: null, fecha: "2026-10-01" }]);
    expect(leerPrefAportes(null)).toEqual({ omitidos: [] });
  });

  it("pendientes de meses anteriores: desde que empezó el Presupuesto, sin los hechos ni los omitidos", () => {
    const ctx = contextoEjemplo(); // hoy 2026-10-15
    const confirmados = [{ activoId: "a1", mes: "2026-09", fecha: "2026-09-03", monto: "1000" }];
    const pref = { omitidos: [{ activoId: "a5", mes: "2026-08", motivo: null, fecha: "2026-09-01" }] };
    const p = pendientesAnteriores(ctx, caja(), confirmados, pref);
    // Septiembre: 5 − 1 hecho = 4; agosto: 5 − 1 omitido = 4. Octubre (mes en curso) no entra.
    expect(p.map((x) => `${x.mes}:${x.activo.id}`)).toEqual(["2026-09:a2", "2026-09:a3", "2026-09:a4", "2026-09:a5", "2026-08:a1", "2026-08:a2", "2026-08:a3", "2026-08:a4"]);
    expect(p[0].monto.toFixed()).toBe("500");
    expect(pendientesAnteriores(ctx, null, [], { omitidos: [] })).toEqual([]);
    expect(pendientesAnteriores(ctx, caja({ config: { inicio: "2026-10-01", colchon: "0", margen: "0", tasaUSD: null } }), [], { omitidos: [] })).toEqual([]);
  });
});

describe("instrumento vencido: su parte no se reparte sola", () => {
  const vencido = () => {
    const activos = [...activosEjemplo(), { ...activosEjemplo()[3], id: "a6", nombre: "Certificado viejo", venc: "2026-09-30" }];
    return contextoEjemplo({ activos });
  };

  it("queda sin destino: los demás de su categoría no suben y no se pide como aporte", () => {
    const ctx = vencido();
    const plan = aportesDelPlan(ctx, AHORRO);
    expect(plan.find((x) => x.activo.id === "a4")?.monto.toFixed()).toBe("2500"); // la mitad de la renta fija, como antes
    expect(plan.find((x) => x.activo.id === "a6")).toMatchObject({ vencido: true });
    expect(aportesDeMes(ctx, "2026-10", AHORRO, [], { omitidos: [] }).some((x) => x.activo.id === "a6")).toBe(false);
    expect(partesVencidas(ctx, AHORRO).map((x) => [x.activo.id, x.pct.toFixed(2), x.monto.toFixed()])).toEqual([["a6", "0.25", "2500"]]);
  });

  it("a otro de la misma categoría: le suma su parte; el vencido queda en 0", () => {
    const r = reubicarParte(vencido(), "a6", "a4")!;
    expect(r.planClases).toBeNull();
    expect(r.aportePct).toEqual({ a4: "1.000000", a6: "0.000000" });
    expect(r.despues.a4.toFixed(2)).toBe("0.50");
    expect(r.parte.toFixed(2)).toBe("0.25");
  });

  it("a otra categoría: cambia el reparto por categoría en esa parte y cada uno conserva lo suyo", () => {
    const r = reubicarParte(vencido(), "a6", "a5")!;
    expect(r.planClases).toEqual({ efectivo: "0.100000", ahorros: "0.100000", rentafija: "0.250000", rentavariable: "0.550000" });
    expect(r.aportePct).toEqual({ a4: "1.000000", a6: "0.000000", a5: "1.000000" });
    expect(r.despues.a4.toFixed(2)).toBe("0.25");
    expect(r.despues.a5.toFixed(2)).toBe("0.55");
    // La suma sigue siendo 100 %.
    expect(Object.values(r.despues).reduce((s, x) => s.plus(x), new Big(0)).toFixed(4)).toBe("1.0000");
  });

  it("no se puede pasar a un vencido, a sí mismo, ni desde uno vigente", () => {
    expect(reubicarParte(vencido(), "a6", "a6")).toBeNull();
    expect(reubicarParte(vencido(), "a4", "a5")).toBeNull();
    expect(reubicarParte(vencido(), "a6", "nada")).toBeNull();
  });
});

describe("revisar la conexión con el Presupuesto", () => {
  const item = (id: string, clase: string, cantidad: string, cajaId: string, extra: Record<string, unknown> = {}) =>
    filaARegistro({ id, clase, nombre: id, institucion: "", moneda: "DOP", cantidad, precio: "1", tasa: "0", origen: "portafolio", orden: 0, saldo_fecha: "2026-10-01", ...extra }, cajaId);
  const datos = (): DatosCaja => ({
    config: { inicio: "2026-10-01", colchon: "0", margen: "0", tasaUSD: null },
    cuentas: [
      { id: "b", nombre: "rb", tipo: "banco", saldoInicial: "10000", limite: null, orden: 0 },
      { id: "p", nombre: "rp", tipo: "prestamo", saldoInicial: "50000", limite: null, orden: 1 },
    ],
    categorias: [],
    recurrentes: [
      { id: "r", nombre: "Alquiler", tipo: "gasto", monto: "3000", moneda: "DOP", pagoTotal: false, cuenta: "b", destino: null, categoria: null, frecuencia: "mensual", dias: "20", cadaN: null, fecha: null, desde: null, hasta: null, activo: true },
    ],
    movimientos: [{ id: "m", fecha: "2026-10-05", tipo: "pago_tarjeta", monto: "1500", moneda: "DOP", tasa: null, cuenta: "b", destino: "p", categoria: null, nota: null, recurrenteId: null, interes: "500" }],
    omitidos: [],
    saldos: [],
    notas: [],
  });

  it("cuadra (✓) cuando los dos lados dicen lo mismo; el pago bajó la deuda solo por el capital", () => {
    const caja = datos();
    const reg = conSaldosVigentes([item("rb", "ahorros", "10000", "b", { subtipo: "corriente" }), item("rp", "prestamo", "50000", "p")], caja, "2026-10-15");
    const r = revisarConexion(reg, caja, "2026-10-15");
    expect(r.cuentas.map((c) => [c.nombre, c.portafolio, c.presupuesto, c.cuadra])).toEqual([
      ["rb", "8500.00", "8500.00", true],
      ["rp", "49000.00", "49000.00", true],
    ]);
  });

  it("el día de un fijo sin confirmar: diferencia y por qué", () => {
    const caja = datos();
    const reg = conSaldosVigentes([item("rb", "ahorros", "10000", "b", { subtipo: "corriente" }), item("rp", "prestamo", "50000", "p")], caja, "2026-10-20");
    const b = revisarConexion(reg, caja, "2026-10-20").cuentas[0];
    expect(b).toMatchObject({ portafolio: "8500.00", presupuesto: "5500.00", diferencia: "3000.00", cuadra: false });
    expect(b.motivos[0]).toMatch(/«Alquiler».*Sí, ya se hizo.*RD\$ 3,000\.00/);
  });

  it("avisa si el nombre o el saldo escrito no llegaron al otro lado, y las cuentas sin enlace", () => {
    const caja = datos();
    const reg = conSaldosVigentes([item("otro nombre", "ahorros", "9999", "b", { subtipo: "corriente" })], caja, "2026-10-15");
    const r = revisarConexion(reg, caja, "2026-10-15");
    expect(r.cuentas[0].cuadra).toBe(false);
    expect(r.cuentas[0].motivos.join(" ")).toMatch(/nombre no coincide.*saldo inicial del Presupuesto/);
    expect(r.sueltas).toEqual([{ cajaId: "p", nombre: "rp" }]);
    expect(revisarConexion([], null, "2026-10-15").sinPresupuesto).toBe(true);
  });
});
