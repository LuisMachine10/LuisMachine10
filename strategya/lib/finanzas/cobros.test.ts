// Manual, sección A: lo que no capitaliza paga interés, cupón o dividendo a una cuenta: ese cobro entra al Presupuesto
// como «Otros ingresos». Aquí, lo que debería llegar al mes (calculado con la tasa y la retención anotadas).
import { describe, expect, it } from "vitest";
import { filaARegistro } from "../capital/registro";
import { cobrosEsperados, nombreCobro } from "./cobros";

const fila = (x: Record<string, unknown>) =>
  filaARegistro({ institucion: "", moneda: "DOP", precio: "1", tasa: "0", origen: "portafolio", orden: 0, saldo_fecha: "2026-10-01", tipo_confirmado: true, ...x }, (x.caja as string) ?? null);

describe("cobros de las inversiones que pagan a una cuenta", () => {
  const nomina = fila({ id: "nom", clase: "ahorros", subtipo: "corriente", tipo: "corriente", nombre: "Nómina", cantidad: "1", caja: "c-nom" });
  it("certificado que paga a una cuenta: 100,000 × 10 % ÷ 12 menos 10 % de retención = 750 al mes", () => {
    const cd = fila({ id: "cd", clase: "rentafija", tipo: "certificado", nombre: "CD", cantidad: "100000", tasa: "0.10", capitaliza: false, paga_a: "nom" });
    const [x] = cobrosEsperados([nomina, cd], null);
    expect([x.instrumento.id, x.alMes.toFixed(2), x.cuentaCaja]).toEqual(["cd", "750.00", "c-nom"]);
  });

  it("lo que capitaliza (o el certificado sin elegir) no paga a una cuenta", () => {
    const cap = fila({ id: "a", clase: "rentafija", tipo: "certificado", nombre: "A", cantidad: "1000", tasa: "0.1", capitaliza: true, paga_a: "nom" });
    const sinElegir = fila({ id: "b", clase: "rentafija", tipo: "certificado", nombre: "B", cantidad: "1000", tasa: "0.1", paga_a: "nom" });
    expect(cobrosEsperados([nomina, cap, sinElegir], null)).toEqual([]);
  });

  it("bono y acción pagan a su cuenta; sin cuenta de cobro escrita no se calcula", () => {
    const bono = fila({ id: "bn", clase: "rentafija", tipo: "bono", nombre: "Bono", cantidad: "120000", tasa: "0.11", paga_a: "nom" });
    const accion = fila({ id: "ac", clase: "rentavariable", tipo: "accion_etf", nombre: "SCHD", cantidad: "10", precio: "27", tasa: "0.035" });
    const r = cobrosEsperados([nomina, bono, accion], null);
    expect(r.map((x) => [x.instrumento.id, x.alMes.toFixed(2)])).toEqual([["bn", "1100.00"]]);
  });

  it("si ya hay un fijo con su nombre, se reconoce (no se agrega dos veces)", () => {
    const bono = fila({ id: "bn", clase: "rentafija", tipo: "bono", nombre: "Bono", cantidad: "120000", tasa: "0.11", paga_a: "nom" });
    const caja = {
      config: null, cuentas: [], categorias: [], movimientos: [], omitidos: [], saldos: [], notas: [],
      recurrentes: [{ id: "r", nombre: nombreCobro(bono), tipo: "ingreso" as const, monto: "1100", moneda: "DOP" as const, pagoTotal: false, cuenta: "c-nom", destino: null, categoria: null, frecuencia: "mensual" as const, dias: "30", cadaN: null, fecha: null, desde: null, hasta: null, activo: true }],
    };
    expect(cobrosEsperados([nomina, bono], caja)[0].fijo?.id).toBe("r");
  });
});
