import { describe, expect, it } from "vitest";
import {
  diaNegociacion,
  estadoMercado,
  estaAbierto,
  frescuraIntradia,
  instanteLocal,
  minutosAbiertos,
  sesionDe,
} from "./mercados.ts";

const t = (iso: string) => new Date(iso);

describe("instanteLocal (horario de verano)", () => {
  it("Nueva York en verano es UTC−4 y en invierno UTC−5", () => {
    expect(instanteLocal("2026-10-15", 9 * 60 + 30, "America/New_York").toISOString()).toBe("2026-10-15T13:30:00.000Z");
    expect(instanteLocal("2026-11-03", 9 * 60 + 30, "America/New_York").toISOString()).toBe("2026-11-03T14:30:00.000Z");
  });
  it("Londres en verano es UTC+1 y en invierno UTC+0; Tokio no cambia", () => {
    expect(instanteLocal("2026-10-15", 8 * 60, "Europe/London").toISOString()).toBe("2026-10-15T07:00:00.000Z");
    expect(instanteLocal("2026-10-26", 8 * 60, "Europe/London").toISOString()).toBe("2026-10-26T08:00:00.000Z");
    expect(instanteLocal("2026-10-15", 9 * 60, "Asia/Tokyo").toISOString()).toBe("2026-10-15T00:00:00.000Z");
  });
});

describe("acciones de EE. UU.", () => {
  it("abre 9:30 y cierra 16:00 de Nueva York", () => {
    expect(estaAbierto("us_acciones", t("2026-10-15T13:29:00Z"))).toBe(false);
    expect(estaAbierto("us_acciones", t("2026-10-15T13:30:00Z"))).toBe(true);
    expect(estaAbierto("us_acciones", t("2026-10-15T19:59:00Z"))).toBe(true);
    expect(estaAbierto("us_acciones", t("2026-10-15T20:00:00Z"))).toBe(false);
  });
  it("tras el cambio de horario (1 nov 2026) la apertura pasa a 14:30 UTC", () => {
    expect(estaAbierto("us_acciones", t("2026-11-02T14:00:00Z"))).toBe(false);
    expect(estaAbierto("us_acciones", t("2026-11-02T14:30:00Z"))).toBe(true);
    expect(estaAbierto("us_acciones", t("2026-11-02T20:30:00Z"))).toBe(true);
  });
  it("las semanas en que Europa ya cambió y Nueva York no (26–30 oct 2026)", () => {
    // Nueva York sigue en verano: 9:30 = 13:30 UTC. Londres ya está en invierno: 8:00 = 8:00 UTC.
    expect(estaAbierto("us_acciones", t("2026-10-27T13:35:00Z"))).toBe(true);
    expect(estaAbierto("europa", t("2026-10-27T07:30:00Z"))).toBe(false);
    expect(estaAbierto("europa", t("2026-10-27T08:00:00Z"))).toBe(true);
  });
  it("feriado (Acción de Gracias) y fin de semana: cerrado; el lunes antes de abrir el dato es del viernes", () => {
    expect(estaAbierto("us_acciones", t("2026-11-26T16:00:00Z"))).toBe(false);
    expect(estaAbierto("us_acciones", t("2026-10-17T16:00:00Z"))).toBe(false);
    expect(diaNegociacion("us_acciones", t("2026-10-19T12:00:00Z"))).toBe("2026-10-16");
  });
  it("cierre anticipado el día después de Acción de Gracias (13:00)", () => {
    expect(sesionDe("us_acciones", "2026-11-27")!.fin.toISOString()).toBe("2026-11-27T18:00:00.000Z");
  });
  it("estado cerrado da la última sesión y la próxima apertura", () => {
    const e = estadoMercado("us_acciones", t("2026-10-17T16:00:00Z"));
    expect(e.abierto).toBe(false);
    expect(e.sesion?.dia).toBe("2026-10-16");
    expect(e.proximaApertura?.toISOString()).toBe("2026-10-19T13:30:00.000Z");
  });
});

describe("futuros, divisas y cripto", () => {
  it("futuros: la sesión del lunes empieza el domingo 18:00 de Nueva York y pausa 17:00–18:00", () => {
    expect(estaAbierto("futuros", t("2026-10-18T21:59:00Z"))).toBe(false);
    expect(estaAbierto("futuros", t("2026-10-18T22:00:00Z"))).toBe(true);
    expect(diaNegociacion("futuros", t("2026-10-18T23:00:00Z"))).toBe("2026-10-19");
    expect(estaAbierto("futuros", t("2026-10-19T21:30:00Z"))).toBe(false); // 17:30 NY
    expect(estaAbierto("futuros", t("2026-10-19T22:05:00Z"))).toBe(true);
    expect(estaAbierto("futuros", t("2026-10-17T12:00:00Z"))).toBe(false); // sábado
  });
  it("divisas: de domingo 17:00 a viernes 17:00 sin pausa", () => {
    expect(estaAbierto("fx", t("2026-10-18T20:59:00Z"))).toBe(false);
    expect(estaAbierto("fx", t("2026-10-18T21:00:00Z"))).toBe(true);
    expect(estaAbierto("fx", t("2026-10-14T21:30:00Z"))).toBe(true);
    expect(estaAbierto("fx", t("2026-10-16T21:00:00Z"))).toBe(false);
  });
  it("cripto siempre abierto; su día es el UTC", () => {
    expect(estaAbierto("cripto", t("2026-10-17T03:00:00Z"))).toBe(true);
    expect(diaNegociacion("cripto", t("2026-10-17T23:59:00Z"))).toBe("2026-10-17");
  });
  it("Asia: el día de Tokio, aunque en UTC sea el día anterior", () => {
    expect(estaAbierto("asia", t("2026-10-15T00:30:00Z"))).toBe(true);
    expect(diaNegociacion("asia", t("2026-10-15T03:00:00Z"))).toBe("2026-10-15");
    expect(estaAbierto("asia", t("2026-10-15T08:30:00Z"))).toBe(false);
  });
});

describe("minutos con el mercado abierto y frescura", () => {
  it("cuenta solo minutos de sesión", () => {
    // Del cierre del viernes al lunes 10:00 NY: 30 minutos abiertos.
    expect(minutosAbiertos("us_acciones", t("2026-10-16T20:00:00Z"), t("2026-10-19T14:00:00Z"))).toBe(30);
    expect(minutosAbiertos("cripto", t("2026-10-16T20:00:00Z"), t("2026-10-16T22:00:00Z"))).toBe(120);
    expect(minutosAbiertos("us_acciones", t("2026-10-19T14:00:00Z"), t("2026-10-19T13:00:00Z"))).toBe(0);
  });
  it("con el mercado cerrado el dato del cierre no se pinta desactualizado", () => {
    const f = frescuraIntradia(t("2026-10-16T20:02:00Z"), 30, "us_acciones", t("2026-10-18T15:00:00Z"));
    expect(f).toEqual({ estado: "cerrado", minutosAbiertos: 0, mercadoAbierto: false });
  });
  it("abierto: vence pasado el máximo; cerrado sin el cierre de la última sesión: vencido", () => {
    expect(frescuraIntradia(t("2026-10-15T14:00:00Z"), 30, "us_acciones", t("2026-10-15T14:20:00Z")).estado).toBe("al_dia");
    expect(frescuraIntradia(t("2026-10-15T14:00:00Z"), 30, "us_acciones", t("2026-10-15T14:45:00Z")).estado).toBe("desactualizado");
    expect(frescuraIntradia(t("2026-10-15T14:00:00Z"), 30, "us_acciones", t("2026-10-17T14:45:00Z")).estado).toBe("desactualizado");
  });
});
