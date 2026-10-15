import { describe, expect, it } from "vitest";
import type { Mercado } from "./mercados.ts";
import { planificar, type SeriePlan } from "./planificador.ts";

const s = (id: string, mercado: Mercado, ultimoIntento: string | null = null, ultimoOk: string | null = ultimoIntento): SeriePlan => ({
  id,
  simbolo: id,
  mercado,
  ultimoIntento: ultimoIntento ? new Date(ultimoIntento) : null,
  ultimoOk: ultimoOk ? new Date(ultimoOk) : null,
  denegadoHasta: null,
});

// Catálogo activo de FMP (14 series) con todas leídas hace 10 minutos.
const hace10 = "2026-10-15T14:50:00Z";
const catalogo = (ultimo: string | null = hace10): SeriePlan[] => [
  s("IDX_SPX", "us_acciones", ultimo), s("IDX_DJI", "us_acciones", ultimo), s("IDX_IXIC", "us_acciones", ultimo),
  s("IDX_RUT", "us_acciones", ultimo), s("IDX_STOXX50E", "europa", ultimo), s("IDX_FTSE", "europa", ultimo),
  s("IDX_N225", "asia", ultimo), s("IDX_HSI", "asia", ultimo), s("ORO", "futuros", ultimo), s("PLATA", "futuros", ultimo),
  s("BRENT", "futuros", ultimo), s("EURUSD", "fx", ultimo), s("USDJPY", "fx", ultimo), s("BTC", "cripto", ultimo),
];

const ahora = new Date("2026-10-15T15:00:00Z"); // jueves, 11:00 NY

describe("planificar", () => {
  it("con presupuesto de sobra (plan pago) refresca todo lo abierto cada 5 min", () => {
    const p = planificar({ series: catalogo("2026-10-15T14:55:00Z"), ahora, limiteDia: 100_000, usadasHoy: 0 });
    expect(p.modo).toBe("todo");
    // Asia cerró a las 8:00 UTC y ya se capturó su cierre: no se pide.
    expect(p.elegidas.map((e) => e.id).sort()).toEqual(
      ["BRENT", "BTC", "EURUSD", "IDX_DJI", "IDX_FTSE", "IDX_IXIC", "IDX_RUT", "IDX_SPX", "IDX_STOXX50E", "ORO", "PLATA", "USDJPY"].sort(),
    );
  });

  it("con 240 llamadas/día reparte: las prioritarias se piden más seguido y el total no pasa del presupuesto", () => {
    const p = planificar({ series: catalogo(), ahora, limiteDia: 240, usadasHoy: 100 });
    expect(p.modo).toBe("nada_pendiente");
    expect(p.intervaloMin.ORO).toBeLessThan(p.intervaloMin.IDX_DJI);
    // Leídas hace 10 min: solo se piden las que ya cumplieron su intervalo (ninguna con 140 restantes).
    expect(p.elegidas).toEqual([]);
    const tarde = planificar({ series: catalogo("2026-10-15T13:00:00Z"), ahora, limiteDia: 240, usadasHoy: 100 });
    expect(tarde.modo).toBe("reparto");
    expect(tarde.elegidas.map((e) => e.id).slice(0, 6)).toEqual(["ORO", "PLATA", "IDX_SPX", "BRENT", "EURUSD", "BTC"]);
  });

  it("simulación de un día completo: nunca pasa de 240 llamadas", () => {
    let series = catalogo(null);
    let usadas = 0;
    const inicio = new Date("2026-10-15T00:00:00Z").getTime();
    for (let m = 0; m < 24 * 60; m += 5) {
      const t = new Date(inicio + m * 60_000);
      const p = planificar({ series, ahora: t, limiteDia: 240, usadasHoy: usadas, reserva: 0 });
      usadas += p.elegidas.length;
      const pedidas = new Set(p.elegidas.map((e) => e.id));
      series = series.map((x) => (pedidas.has(x.id) ? { ...x, ultimoIntento: t, ultimoOk: t } : x));
    }
    expect(usadas).toBeLessThanOrEqual(240);
    expect(usadas).toBeGreaterThan(150);
  });

  it("sin presupuesto no pide nada", () => {
    const p = planificar({ series: catalogo(null), ahora, limiteDia: 240, usadasHoy: 240 });
    expect(p).toMatchObject({ modo: "sin_presupuesto", elegidas: [] });
  });

  it("tras el cierre pide una vez más para capturar el precio de cierre, y luego nada", () => {
    const cierre = new Date("2026-10-15T20:05:00Z"); // 16:05 NY
    const a = planificar({ series: [s("IDX_SPX", "us_acciones", "2026-10-15T19:50:00Z")], ahora: cierre, limiteDia: 240, usadasHoy: 0 });
    expect(a.elegidas).toEqual([{ id: "IDX_SPX", simbolo: "IDX_SPX", motivo: "cierre" }]);
    const b = planificar({ series: [s("IDX_SPX", "us_acciones", "2026-10-15T20:05:00Z")], ahora: new Date("2026-10-15T20:10:00Z"), limiteDia: 240, usadasHoy: 0 });
    expect(b.elegidas).toEqual([]);
  });

  it("un símbolo negado no se pide hasta que vence la pausa", () => {
    const negado = { ...s("IDX_GDAXI", "europa"), denegadoHasta: new Date("2026-10-16T09:00:00Z") };
    expect(planificar({ series: [negado], ahora, limiteDia: null, usadasHoy: 0 }).elegidas).toEqual([]);
  });

  it("nunca leída con el mercado cerrado: una primera lectura (el último cierre)", () => {
    const p = planificar({ series: [s("IDX_N225", "asia")], ahora, limiteDia: 240, usadasHoy: 0 });
    expect(p.elegidas).toEqual([{ id: "IDX_N225", simbolo: "IDX_N225", motivo: "primera" }]);
  });

  it("respeta la reserva para otras tareas", () => {
    const p = planificar({ series: catalogo(null), ahora, limiteDia: 240, usadasHoy: 230, reserva: 14 });
    expect(p.modo).toBe("sin_presupuesto");
  });
});
