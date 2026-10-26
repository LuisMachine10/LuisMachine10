// Fase F en el Portafolio: la revisión de la conexión con el Presupuesto. Datos SINTÉTICOS (cifras redondas inventadas).
// (Los «aportes del mes» por porcentaje, «Omitir este mes» y reubicar la parte de un vencido se retiraron en el
// Núcleo v2: el plan del mes va en montos por instrumento. Sus pruebas están en lib/finanzas/plan.test.ts.)

import { describe, expect, it } from "vitest";
import type { DatosCaja } from "../caja/tipos";
import { revisarConexion } from "./conexion";
import { conSaldosVigentes, filaARegistro } from "./registro";

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
