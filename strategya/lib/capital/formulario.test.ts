import { describe, expect, it } from "vitest";
import { cierreEjemplo, parametrosEjemplo } from "./apoyo-pruebas";
import { aPct, cierreDeFormulario, desagregar, filas, instrumentoDeFormulario, mesDeParametro, mezclarParametros, modoCierre, numeroForm, pctForm, rutaSegura } from "./formulario";
import { cierreVacio } from "./tipos";
import { Registro, validarActivo, validarCierre, validarParametros } from "./validar";

describe("lectura de formularios", () => {
  it("números y porcentajes sin pasar por float", () => {
    expect(numeroForm(" 1,234.50 ")).toBe("1234.50");
    expect(numeroForm("RD$5,000")).toBe("5000");
    expect(pctForm("4.5")).toBe("0.045");
    expect(pctForm("0.1")).toBe("0.001");
    expect(pctForm("")).toBe("");
    expect(pctForm("abc")).toBe("abc");
    expect(aPct("0.045")).toBe("4.5");
    expect(aPct(null)).toBe("");
  });

  it("filas numeradas en orden", () => {
    expect(filas({ "t.1.nombre": "B", "t.0.nombre": "A", "t.0.limite": "5", otro: "x" }, "t")).toEqual([{ nombre: "A", limite: "5" }, { nombre: "B" }]);
  });

  it("mezcla una sección con los parámetros guardados y deja las demás intactas", () => {
    const p = parametrosEjemplo();
    const r = new Registro();
    const nuevo = validarParametros(
      mezclarParametros(p, "asignacion", { "meta.efectivo": "15", "meta.ahorros": "5", "meta.rentafija": "50", "meta.rentavariable": "30", bandaRebalanceo: "3", maxEmisor: "20" }),
      r,
      "p",
      false,
    );
    expect(r.errores).toEqual([]);
    expect(nuevo.metaAsignacion).toEqual({ efectivo: "0.15", ahorros: "0.05", rentafija: "0.5", rentavariable: "0.3" });
    expect(nuevo.bandaRebalanceo).toBe("0.03");
    expect(nuevo.tarjetas).toEqual(p.tarjetas);
    expect(nuevo.metaFondo).toBe(p.metaFondo);
    const conFondo = mezclarParametros(p, "asignacion", { "meta.efectivo": "10", metaFondo: "6" });
    expect(conFondo.metaFondo).toBe("6");
  });

  it("instrumento simple: monto o cantidad × precio, y la fecha registra la compra", () => {
    const saldo = instrumentoDeFormulario({ modo: "monto", nombre: "Ahorros", clase: "ahorros", moneda: "DOP", monto: "25,000.50", cantidad: "9", precio: "9", fecha: "" });
    expect(saldo.activo).toMatchObject({ clase: "ahorros", cantidad: "25000.50", precio: "1" });
    expect(saldo.compra).toBeNull();
    const acciones = instrumentoDeFormulario({ modo: "unidades", nombre: "ETF", clase: "rentavariable", moneda: "USD", cantidad: "3", precio: "101.25", fecha: "2026-10-01" });
    expect(acciones.activo).toMatchObject({ cantidad: "3", precio: "101.25" });
    expect(String(acciones.activo.id)).toMatch(/^a-/);
    expect(acciones.compra).toEqual({ fecha: "2026-10-01", cantidad: "3", precio: "101.25" });
    const r = new Registro();
    expect(validarActivo(acciones.activo, "i", r)?.clase).toBe("rentavariable");
    expect(r.errores).toEqual([]);
  });

  it("tarjetas: nombre vacío quita, fila nueva recibe id", () => {
    const p = parametrosEjemplo();
    const crudo = mezclarParametros(p, "tarjetas", { "tarjetas.0.id": "tc-a", "tarjetas.0.nombre": "", "tarjetas.1.id": "", "tarjetas.1.nombre": "Nueva", "tarjetas.1.limite": "1,000" });
    const t = (crudo.tarjetas as { id: string; nombre: string; limite: string }[]);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ nombre: "Nueva", limite: "1000" });
    expect(t[0].id).toMatch(/^tc-/);
  });

  it("un número mal escrito lo rechaza el validador", () => {
    const r = new Registro();
    validarParametros(mezclarParametros(parametrosEjemplo(), "generales", { horizonte: "cinco" }), r, "p", false);
    expect(r.errores.join()).toMatch(/horizonte/);
  });

  it("cierre desde el formulario: partidas vigentes, tarjetas y deudas; conserva la foto", () => {
    const p = parametrosEjemplo();
    const guardado = { ...cierreVacio(), snap: { activos: "1", pasivos: "0", patrimonio: "1", liquidos: "0", ingresoPasivoAnual: "0", fecha: null, fx: null } };
    const crudo = cierreDeFormulario(p, guardado, { "ingresos.in-1": "50,000.25", "fijos.gf-1": "", "tarjetas.tc-a.uso": "300", "deudas.tc": "300", "ingresos.vieja": "9" }, "guardar");
    const r = new Registro();
    const c = validarCierre(crudo, "c", r)!;
    expect(r.errores).toEqual([]);
    expect(c.ingresos).toEqual({ "in-1": "50000.25" });
    expect(c.fijos).toEqual({ "gf-1": null });
    expect(c.tarjetas["tc-a"]).toEqual({ uso: "300", full: false });
    expect(c.deudas.tc).toBe("300");
    expect(c.snap?.patrimonio).toBe("1");
    const conPres = cierreDeFormulario(p, null, {}, "presupuesto:fijos") as { fijos: Record<string, string> };
    expect(conPres.fijos).toEqual({ "gf-1": "15000" });
  });

  it("desagregar prorratea el total por presupuesto (a 2 decimales)", () => {
    const p = { ...parametrosEjemplo(), fijos: [{ id: "f1", nombre: "A", pres: "1" }, { id: "f2", nombre: "B", pres: "2" }] };
    const c = desagregar(p, { ...cierreEjemplo(), agregado: true, totFijos: "100", totIngresos: "10", totVariables: null, totAportes: "0" });
    expect(c.agregado).toBe(false);
    expect(c.fijos).toEqual({ f1: "33.33", f2: "66.67" });
    expect(c.nota).toMatch(/prorrateado/);
  });

  it("modo, mes y ruta de vuelta seguros", () => {
    expect(modoCierre("cerrar")).toBe("cerrar");
    expect(modoCierre("presupuesto:fijos")).toBe("presupuesto:fijos");
    expect(modoCierre("borrar todo")).toBe("guardar");
    expect(mesDeParametro("2026-02", "2026-10-15")).toBe("2026-02");
    expect(mesDeParametro("2026-13", "2026-10-15")).toBe("2026-10");
    expect(rutaSegura("/capital/cartera")).toBe("/capital/cartera");
    expect(rutaSegura("https://otro.sitio")).toBe("/capital");
    expect(rutaSegura("/capital/../estado")).toBe("/capital");
  });
});
