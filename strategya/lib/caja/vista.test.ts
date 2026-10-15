import { describe, expect, it } from "vitest";
import { EJEMPLO } from "../../pruebas/apoyo/caja-ejemplo";
import { filasADatos } from "./filas";
import { parsearImportacion } from "./importar";
import { horizonte, simular } from "./motor";
import { armarVistaMes, proximos, ultimoCuadre } from "./vista";

const datos = parsearImportacion(EJEMPLO).datos!;
const hoy = "2026-10-20";
const sim = simular(datos, { hoy, hasta: horizonte("2026-10", hoy) });

describe("vista del mes", () => {
  it("rejilla de semanas que empiezan el lunes, con relleno de los meses vecinos", () => {
    const v = armarVistaMes(datos, sim, "2026-10");
    expect(v.semanas.every((s) => s.length === 7)).toBe(true);
    expect(v.semanas[0][0].fecha).toBe("2026-09-28"); // lunes
    expect(v.semanas.at(-1)!.at(-1)!.fecha).toBe("2026-11-01"); // domingo
    const sep30 = v.semanas[0][2];
    expect(sep30).toMatchObject({ enMes: false, antesDelInicio: true, estado: null, abreviado: null });
    expect(Object.keys(v.paneles)).toHaveLength(31);
  });

  it("celdas con cifra abreviada, marcas y etiqueta accesible", () => {
    const v = armarVistaMes(datos, sim, "2026-10");
    const c15 = v.semanas.flat().find((c) => c.fecha === "2026-10-15")!;
    expect(c15).toMatchObject({ ingreso: true, registrados: 2, cuadre: true, nota: true, abreviado: "59.7k" });
    expect(c15.etiqueta).toBe("jueves 15 de octubre, disponible RD$ 59,654.73, holgado, con ingreso, 2 registrado(s), con nota");
    const c5 = v.semanas.flat().find((c) => c.fecha === "2026-10-05")!;
    expect(c5.porConfirmar).toBe(1);
    const c20 = v.semanas.flat().find((c) => c.fecha === "2026-10-20")!;
    expect(c20.esHoy).toBe(true);
    expect(c20.etiqueta).toContain("hoy");
  });

  it("panel del día: saldos por cuenta (tarjeta como deuda) y saldo real", () => {
    const p = armarVistaMes(datos, sim, "2026-10").paneles["2026-10-15"];
    expect(p.cuentas.map((c) => [c.nombre, c.saldo, c.real])).toEqual([
      ["Banco A", "59000.1", "59000.1"],
      ["Cartera", "654.63", null],
      ["Visa", "7020", "7020"],
      ["Fondo", "5000.1", null],
    ]);
    expect(p.esPasado).toBe(true);
    expect(p.nota).toBe("Cuadré con el banco");
  });

  it("último cuadre y próximos 7 días", () => {
    expect(ultimoCuadre(datos, hoy)).toEqual({ fecha: "2026-10-15", dias: 5 });
    expect(ultimoCuadre({ ...datos, saldos: [] }, hoy)).toEqual({ fecha: null, dias: null });
    const sim2 = simular(datos, { hoy: "2026-10-26", hasta: "2026-11-30" });
    // Del 26 oct al 1 nov: pago total el 28 y quincena el 30 (la «Nube» cada 30 días cae el 4 nov).
    expect(proximos(sim2, 7).map((x) => [x.fecha, x.o.recurrenteId])).toEqual([
      ["2026-10-28", "r2"],
      ["2026-10-30", "r1"],
    ]);
  });
});

describe("filas de Postgres → modelo", () => {
  it("convierte nombres de columna, fechas Date de node-postgres y nulos", () => {
    const d = filasADatos({
      config: { inicio: new Date(2026, 9, 1), colchon: "5000", margen: "3000", tasa_usd: null },
      cuentas: [{ id: "b", nombre: "B", tipo: "banco", saldo_inicial: "1.10", limite: null, orden: 2 }],
      categorias: [],
      recurrentes: [{ id: "r", nombre: "R", tipo: "gasto", monto: "5", moneda: "DOP", pago_total: false, cuenta: "b", destino: null,
        categoria: null, frecuencia: "cada_n", dias: "", cada_n: 3, fecha: null, desde: "2026-10-02", hasta: null, activo: true }],
      movimientos: [],
      omitidos: [{ fecha: "2026-10-03", recurrente_id: "r" }],
      saldos: [],
      notas: [],
    });
    expect(d.config).toEqual({ inicio: "2026-10-01", colchon: "5000", margen: "3000", tasaUSD: null });
    expect(d.cuentas[0]).toEqual({ id: "b", nombre: "B", tipo: "banco", saldoInicial: "1.10", limite: null, orden: 2 });
    expect(d.recurrentes[0]).toMatchObject({ cadaN: 3, desde: "2026-10-02", pagoTotal: false });
    expect(d.omitidos).toEqual([{ fecha: "2026-10-03", recurrenteId: "r" }]);
  });
});
