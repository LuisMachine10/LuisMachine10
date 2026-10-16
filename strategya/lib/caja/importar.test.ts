import { describe, expect, it } from "vitest";
import { aJsonSQL, parsearImportacion } from "./importar";
import { simular } from "./motor";
import { EJEMPLO } from "../../pruebas/apoyo/caja-ejemplo";
import { montoDeTexto, validarConfig, validarCuenta, validarMovimiento, validarRecurrente, validarSaldoReal } from "./validar";



describe("importación del artefacto", () => {
  it("lee el ejemplo completo con montos exactos y conserva los ids", () => {
    const r = parsearImportacion(EJEMPLO);
    expect(r.errores).toEqual([]);
    expect(r.resumen).toEqual({
      cuentas: 4, categorias: 2, recurrentes: 4, movimientos: 4, omitidos: 1, saldos: 2, notas: 1,
      primerDia: "2026-10-02", ultimoDia: "2026-10-15", inicio: "2026-10-01",
    });
    const d = r.datos!;
    expect(d.config).toEqual({ inicio: "2026-10-01", colchon: "5000", margen: "3000", tasaUSD: "60.25" });
    expect(d.cuentas.map((c) => [c.id, c.saldoInicial])).toEqual([["c1", "25000.1"], ["c2", "1500"], ["c3", "7000"], ["c4", "0.1"]]);
    expect(d.categorias[1]).toEqual({ id: "k2", nombre: "Comida", grupo: "variable", presupuesto: "12000.5" });
    expect(d.recurrentes[1]).toMatchObject({ id: "r2", pagoTotal: true, destino: "c3", dias: "28" });
    expect(d.recurrentes[2]).toMatchObject({ frecuencia: "cada_n", cadaN: 30, moneda: "USD", monto: "2.99", desde: "2026-10-05" });
    expect(d.recurrentes[3]).toMatchObject({ frecuencia: "unica", fecha: "2026-11-02", activo: false });
    expect(d.movimientos.map((m) => m.id)).toEqual(["i1", "i2", "i3", "i1-2"]);
    expect(d.movimientos[1]).toMatchObject({ moneda: "USD", tasa: "59.8", monto: "20" });
    expect(d.movimientos[2]).toMatchObject({ recurrenteId: "r1", categoria: "k1" });
    expect(d.saldos).toEqual([
      { fecha: "2026-10-15", cuentaId: "c1", saldo: "59000.1" },
      { fecha: "2026-10-15", cuentaId: "c3", saldo: "7020" },
    ]);
    expect(d.notas).toEqual([{ fecha: "2026-10-15", nota: "Cuadré con el banco" }]);
    expect(r.advertencias.some((a) => a.includes("margen"))).toBe(true);
    expect(r.advertencias.some((a) => a.includes("«i1» estaba repetido"))).toBe(true);
  });

  it("lo importado se simula: confirmado, omitido y saldo real", () => {
    const d = parsearImportacion(EJEMPLO).datos!;
    const sim = simular(d, { hoy: "2026-10-20", hasta: "2026-10-31" });
    const d15 = sim.porFecha.get("2026-10-15")!;
    expect(d15.porConfirmar).toEqual([]);
    expect(d15.omitidos.map((o) => o.recurrenteId)).toEqual([]); // r3 cae el 5 y el 4 nov, no el 15
    expect(d15.ajustes.find((a) => a.cuentaId === "c1")).toMatchObject({ real: "59000.1", esperado: "60000.1", diferencia: "-1000" });
    // Visa: 7000 + 20×59.8 (=1196) = 8196 → el banco dice 7020.
    expect(d15.ajustes.find((a) => a.cuentaId === "c3")).toMatchObject({ esperado: "8196", diferencia: "-1176" });
    const d5 = sim.porFecha.get("2026-10-05")!;
    expect(d5.porConfirmar.map((o) => o.recurrenteId)).toEqual(["r3"]);
    // Pago total el 28: lo que se debe en la Visa.
    expect(sim.porFecha.get("2026-10-28")!.planificados[0]).toMatchObject({ recurrenteId: "r2", monto: "7020" });
  });

  it("forma para SQL: columnas y montos como texto", () => {
    const j = aJsonSQL(parsearImportacion(EJEMPLO).datos!);
    expect(j.config).toEqual({ inicio: "2026-10-01", colchon: "5000", margen: "3000", tasa_usd: "60.25" });
    expect(j.movimientos[0]).toEqual({
      id: "i1", fecha: "2026-10-02", tipo: "gasto", monto: "845.37", moneda: "DOP", tasa: null, cuenta: "c2",
      destino: null, categoria: "k2", nota: "Colmado", recurrente_id: null,
    });
    expect(j.recurrentes[2]).toMatchObject({ cada_n: 30, pago_total: false });
    // Ningún monto viaja como número JSON (solo orden y cada_n, que son enteros).
    const montos = [...j.cuentas.map((c) => c.saldo_inicial), ...j.movimientos.map((m) => m.monto), ...j.recurrentes.map((r) => r.monto)];
    expect(montos.every((m) => typeof m === "string")).toBe(true);
  });

  it("errores que impiden importar", () => {
    expect(parsearImportacion("no es json").errores[0]).toMatch(/no es JSON válido/);
    expect(parsearImportacion("[]").errores[0]).toMatch(/debe ser un objeto/);
    expect(parsearImportacion("{}").errores).toContain("Falta «config» (inicio, colchon, margen, tasaUSD).");
    const malo = parsearImportacion(`{
      "config": {"inicio": "2026-13-01", "colchon": "mucho"},
      "cuentas": {"x": {"tipo": "cripto"}},
      "categorias": {"y": {"grupo": "otro"}},
      "recurrentes": {"z": {"tipo": "regalo"}, "w": {"tipo": "gasto", "frecuencia": "anual"}},
      "dias": {"ayer": {}, "2026-10-01": {"items": [{"tipo": "gasto", "monto": "abc"}, {"tipo": "gasto", "moneda": "EUR"}], "saldos": {"c": true}}}
    }`);
    expect(malo.datos).toBeNull();
    expect(malo.errores).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/config\.inicio/),
        expect.stringMatching(/config\.colchon/),
        expect.stringMatching(/cuentas\.x\.tipo/),
        expect.stringMatching(/categorias\.y\.grupo/),
        expect.stringMatching(/recurrentes\.z\.tipo/),
        expect.stringMatching(/recurrentes\.w\.frecuencia/),
        expect.stringMatching(/dias\.ayer/),
        expect.stringMatching(/items\[0\]\.monto/),
        expect.stringMatching(/items\[1\]\.moneda/),
        expect.stringMatching(/saldos\.c/),
      ]),
    );
  });

  it("advierte referencias rotas y US$ sin tasa, sin bloquear", () => {
    const r = parsearImportacion(`{
      "config": {"inicio": "2026-10-01", "colchon": 0, "margen": 0},
      "dias": {"2026-10-03": {"items": [{"tipo": "gasto", "monto": 5, "moneda": "USD", "cuenta": "nada", "cat": "nada", "rid": "nada"}],
                              "omitidos": ["nada"]}}
    }`);
    expect(r.errores).toEqual([]);
    expect(r.datos!.config.tasaUSD).toBeNull();
    expect(r.advertencias.join("\n")).toMatch(/cuenta «nada» no existe/);
    expect(r.advertencias.join("\n")).toMatch(/categoría «nada» no existe/);
    expect(r.advertencias.join("\n")).toMatch(/recurrente «nada», que ya no existe/);
    expect(r.advertencias.join("\n")).toMatch(/1 movimiento\(s\) en US\$ sin tasa/);
    expect(r.datos!.movimientos[0].id).toBe("2026-10-03-1");
  });

  it("acepta BOM y números con mucha precisión sin perderla", () => {
    const r = parsearImportacion(`﻿{"config": {"inicio": "2026-10-01", "colchon": 0.1, "margen": 1e3, "tasaUSD": 60.123456789012345678}}`);
    expect(r.datos!.config).toEqual({ inicio: "2026-10-01", colchon: "0.1", margen: "1000", tasaUSD: "60.123456789012345678" });
  });
});

describe("validación de formularios", () => {
  it("montos escritos por una persona", () => {
    expect(montoDeTexto("1,500.50")).toBe("1500.5");
    expect(montoDeTexto("RD$ 2,000")).toBe("2000");
    expect(montoDeTexto("  ")).toBeNull();
    expect(() => montoDeTexto("12a")).toThrow();
  });

  it("movimiento: exige monto positivo, cuenta y destino distinto", () => {
    expect(validarMovimiento({ fecha: "2026-10-15", tipo: "gasto", monto: "0", cuenta: "b" })).toEqual({ ok: false, error: "Monto: debe ser mayor que cero." });
    expect(validarMovimiento({ fecha: "2026-10-15", tipo: "gasto", monto: "10" })).toEqual({ ok: false, error: "Elige la cuenta." });
    expect(validarMovimiento({ fecha: "2026-10-15", tipo: "transferencia", monto: "10", cuenta: "b", destino: "b" }).ok).toBe(false);
    expect(validarMovimiento({ fecha: "2026-02-30", tipo: "gasto", monto: "10", cuenta: "b" }).ok).toBe(false);
    const r = validarMovimiento({ fecha: "2026-10-15", tipo: "gasto", monto: "1,200.5", moneda: "USD", tasa: "", cuenta: "b", destino: "x", nota: " " });
    expect(r).toEqual({
      ok: true,
      valor: { fecha: "2026-10-15", tipo: "gasto", monto: "1200.5", moneda: "USD", tasa: null, cuenta: "b", destino: null, categoria: null, nota: null, recurrenteId: null },
    });
  });

  it("recurrente: días del mes, cada N, única y pago total", () => {
    const b = { nombre: "X", tipo: "gasto", monto: "10", cuenta: "b", activo: "true" };
    expect(validarRecurrente({ ...b, dias: "15, 32" }).ok).toBe(false);
    expect(validarRecurrente({ ...b, dias: "15, 31" })).toMatchObject({ ok: true, valor: { dias: "15, 31", frecuencia: "mensual" } });
    expect(validarRecurrente({ ...b, frecuencia: "cada_n", cadaN: "0" }).ok).toBe(false);
    expect(validarRecurrente({ ...b, frecuencia: "cada_n", cadaN: "14" })).toMatchObject({ ok: true, valor: { cadaN: 14, dias: "" } });
    expect(validarRecurrente({ ...b, frecuencia: "unica", fecha: "2026-11-01" })).toMatchObject({ ok: true, valor: { fecha: "2026-11-01" } });
    expect(validarRecurrente({ ...b, dias: "1", desde: "2026-11-01", hasta: "2026-10-01" }).ok).toBe(false);
    const pt = validarRecurrente({ nombre: "Pago", tipo: "pago_tarjeta", pagoTotal: "on", monto: "", cuenta: "b", destino: "v", dias: "28", activo: "false" });
    expect(pt).toMatchObject({ ok: true, valor: { pagoTotal: true, monto: "0", moneda: "DOP", activo: false } });
  });

  it("config, cuenta y saldo real", () => {
    expect(validarConfig({ inicio: "2026-10-01", colchon: "5,000", margen: "3000", tasaUSD: "" })).toEqual({
      ok: true,
      valor: { inicio: "2026-10-01", colchon: "5000", margen: "3000", tasaUSD: null },
    });
    expect(validarConfig({ inicio: "2026-10-01", colchon: "", margen: "3000" }).ok).toBe(false);
    expect(validarConfig({ inicio: "2026-10-01", colchon: "1", margen: "1", tasaUSD: "0" }).ok).toBe(false);
    expect(validarCuenta({ nombre: "Visa", tipo: "tarjeta", saldoInicial: "-5" }).ok).toBe(false);
    expect(validarCuenta({ nombre: "Banco", tipo: "banco", saldoInicial: "-5", orden: "2" })).toMatchObject({ ok: true, valor: { saldoInicial: "-5", orden: 2 } });
    expect(validarSaldoReal("")).toEqual({ ok: true, valor: null });
    expect(validarSaldoReal("-12.5")).toEqual({ ok: true, valor: "-12.5" });
  });
});
