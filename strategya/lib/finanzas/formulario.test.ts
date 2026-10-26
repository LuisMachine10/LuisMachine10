// Manual, sección A en el formulario de Mis cuentas: el tipo fija la clase; lo elegible se escribe; la moneda es
// independiente del tipo (también €); los cobros solo caen en efectivo o una cuenta; retención y comisión en %.
import { describe, expect, it } from "vitest";
import { registroDeFormulario, TIPOS_ALTA, tipoAltaDe } from "../capital/formulario-registro";
import type { TipoFin } from "./catalogo";

const HOY = "2026-10-26";
const cuentas: { id: string; tipo: TipoFin }[] = [
  { id: "nomina", tipo: "corriente" },
  { id: "cd", tipo: "certificado" },
];

describe("formulario de Mis cuentas con el catálogo de tipos", () => {
  it("cada tipo del catálogo se puede elegir (los bienes, como vehículo, inmueble u otro)", () => {
    expect(TIPOS_ALTA.map((t) => t.id)).toEqual([
      "efectivo", "corriente", "ahorro", "alto_rendimiento", "certificado", "mutuo", "bono", "fondo_abierto", "fondo_cerrado", "accion_etf", "fideicomiso",
      "vehiculo", "inmueble", "otro", "tarjeta", "prestamo", "otra_deuda",
    ]);
  });

  it("el tipo decide la clase del motor y queda confirmado", () => {
    const r = registroDeFormulario({ tipo: "mutuo", nombre: "Mutuo Puesto X", moneda: "DOP", saldo: "200,000", plazoDias: "30", tasa: "9" }, HOY);
    expect(r).toMatchObject({ ok: true, valor: { tipo: "mutuo", clase: "rentafija", tipo_confirmado: true, plazo_dias: 30, tasa: "0.09" } });
    expect(tipoAltaDe("rentafija", null, "mutuo")).toBe("mutuo");
  });

  it("la moneda es independiente del tipo: efectivo y cuentas en €", () => {
    expect(registroDeFormulario({ tipo: "efectivo", nombre: "Euros de viaje", moneda: "EUR", saldo: "300" }, HOY)).toMatchObject({ ok: true, valor: { moneda: "EUR", tipo: "efectivo" } });
    expect(registroDeFormulario({ tipo: "ahorro", nombre: "Cuenta en euros", moneda: "EUR", saldo: "1000" }, HOY)).toMatchObject({ ok: true, valor: { moneda: "EUR" } });
  });

  it("alto rendimiento: «tiene tarjeta de débito» se escribe (si no, no sirve para pagar)", () => {
    expect(registroDeFormulario({ tipo: "alto_rendimiento", nombre: "Alto", saldo: "1", debito: "si" }, HOY)).toMatchObject({ ok: true, valor: { tiene_debito: true } });
    expect(registroDeFormulario({ tipo: "alto_rendimiento", nombre: "Alto", saldo: "1" }, HOY)).toMatchObject({ ok: true, valor: { tiene_debito: false } });
    expect(registroDeFormulario({ tipo: "ahorro", nombre: "Ahorro", saldo: "1", debito: "si" }, HOY)).toMatchObject({ ok: true, valor: { tiene_debito: null } });
  });

  it("certificado ELEGIBLE: capitaliza o paga a una cuenta; la cuenta de cobro debe ser efectivo o banco", () => {
    expect(registroDeFormulario({ tipo: "certificado", nombre: "CD", saldo: "100000", capitaliza: "no", pagaA: "nomina" }, HOY, cuentas)).toMatchObject({ ok: true, valor: { capitaliza: false, paga_a: "nomina" } });
    expect(registroDeFormulario({ tipo: "certificado", nombre: "CD", saldo: "100000", capitaliza: "si" }, HOY, cuentas)).toMatchObject({ ok: true, valor: { capitaliza: true } });
    expect(registroDeFormulario({ tipo: "certificado", nombre: "CD", saldo: "100000", pagaA: "cd" }, HOY, cuentas)).toMatchObject({ ok: false, error: expect.stringContaining("efectivo o en una cuenta") });
  });

  it("retención (certificados 10 % por defecto, editable) y comisión de puesto de bolsa (opcional) en %", () => {
    expect(registroDeFormulario({ tipo: "certificado", nombre: "CD", saldo: "1", retencion: "5" }, HOY)).toMatchObject({ ok: true, valor: { retencion: "0.05", comision_admin: null } });
    expect(registroDeFormulario({ tipo: "fondo_abierto", nombre: "Fondo", saldo: "1", comision: "1.25" }, HOY)).toMatchObject({ ok: true, valor: { comision_admin: "0.0125" } });
    expect(registroDeFormulario({ tipo: "fondo_abierto", nombre: "Fondo", saldo: "1" }, HOY)).toMatchObject({ ok: true, valor: { comision_admin: null } });
    expect(registroDeFormulario({ tipo: "certificado", nombre: "CD", saldo: "1", retencion: "150" }, HOY)).toMatchObject({ ok: false });
  });

  it("fondos: de renta fija o variable según su reglamento; por cuotas o como saldo", () => {
    expect(registroDeFormulario({ tipo: "fondo_abierto", nombre: "Fondo", claseRV: "rentavariable", cantidad: "500", precio: "120.50" }, HOY)).toMatchObject({
      ok: true,
      valor: { clase: "rentavariable", cantidad: "500", precio: "120.5" },
    });
    expect(registroDeFormulario({ tipo: "fondo_abierto", nombre: "Fondo", saldo: "60,000" }, HOY)).toMatchObject({ ok: true, valor: { clase: "rentafija", cantidad: "60000", precio: "1" } });
  });

  it("préstamo: cargos dentro de la cuota (seguro…)", () => {
    expect(registroDeFormulario({ tipo: "prestamo", nombre: "Carro", saldo: "300000", cuota: "10,700", cargosCuota: "1,200" }, HOY)).toMatchObject({ ok: true, valor: { cargos_cuota: "1200", cuota: "10700" } });
  });
});
