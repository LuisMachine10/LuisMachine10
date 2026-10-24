// Matriz de riesgo con los umbrales de fábrica. Cifras SINTÉTICAS.
import { describe, expect, it } from "vitest";
import { activosEjemplo, contextoEjemplo } from "./apoyo-pruebas";
import { gravedad, matrizRiesgo, tonoGravedad } from "./matriz";
import { filaARegistro } from "./registro";

const presupuesto = (gastoReal: string, ingresos = "100000") => ({
  mes: "2026-10",
  presupuestado: { ingresos, gastos_totales: "50000", utilidad_neta: "50000", ahorro: "10000" },
  real: { ingresos: "0", gastos_totales: gastoReal },
  ahorroMensual: "10000",
});

describe("matriz de riesgo 3×3", () => {
  it("evalúa los 4 riesgos con el dato que los dispara y su fuente", () => {
    const tc = filaARegistro({ id: "tc", clase: "tarjeta", nombre: "Visa", moneda: "DOP", cantidad: "40000", precio: "1", tasa: "0", saldo_fecha: "2026-10-01" });
    const ctx = { ...contextoEjemplo(), presupuesto: presupuesto("56000"), registro: [tc] };
    const m = Object.fromEntries(matrizRiesgo(ctx).map((r) => [r.id, r]));
    // Líquidos: 10,000 + 50,000 + US$ 500 × 60 = 90,000 → 1.8 meses de 50,000 (mínimo 6): impacto alto.
    expect(m.liquidez).toMatchObject({ impacto: "alto", probabilidad: "medio", sinDato: false });
    expect(m.liquidez.dato).toMatch(/1\.8 meses/);
    expect(m.liquidez.fuente).toMatch(/Presupuesto de 2026-10/);
    // Certificado de 100,000 sobre 220,000 = 45 % (límite 25 % → 1.8×): alto; renta fija → probabilidad media.
    expect(m.concentracion).toMatchObject({ impacto: "alto", probabilidad: "medio" });
    // En dólares: (30,000 + 60,000) / 220,000 = 41 %, dentro de 20–50 %.
    expect(m.dolar).toMatchObject({ impacto: "bajo", probabilidad: "bajo" });
    // Gasto 12 % sobre lo presupuestado (> 10 %): probabilidad alta; tarjetas 40 % del ingreso (> 30 %): impacto alto.
    expect(m.presupuesto).toMatchObject({ impacto: "alto", probabilidad: "alto" });
    expect(tonoGravedad(m.presupuesto)).toBe("alto");
    expect(gravedad(m.dolar)).toBe(0);
  });

  it("los umbrales se editan; sin Presupuesto, dice que falta el dato", () => {
    const base = contextoEjemplo({ activos: activosEjemplo().slice(0, 2) });
    const ctx = { ...base, p: { ...base.p, umbrales: { ...base.p.umbrales, colchonMeses: "1" } } };
    const m = Object.fromEntries(matrizRiesgo(ctx).map((r) => [r.id, r]));
    expect(m.presupuesto.sinDato).toBe(true);
    expect(m.liquidez.sinDato).toBe(true); // sin cierres ni Presupuesto no hay gasto mensual
  });
});
