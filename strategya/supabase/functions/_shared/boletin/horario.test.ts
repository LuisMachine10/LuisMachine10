// Horario de las ediciones: hora RD → UTC para pg_cron, qué día sale cada una y la migración que las programa.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buscarTarea } from "../tareas.ts";
import { claveIdempotencia, cronUtc, diaSemanaRD, EDICIONES, fechaRD, MINUTOS_REINTENTO, nombreTarea, rdAUtc, tocaHoy } from "./horario.ts";
import { TIPOS_EDICION } from "./tipos.ts";

const MIGRACION = readFileSync(join(import.meta.dirname, "..", "..", "..", "migrations", "20261026000100_boletin.sql"), "utf8");

describe("hora RD → UTC (RD es UTC−4 todo el año)", () => {
  it("suma 4 horas y pasa de día si cruza la medianoche", () => {
    expect(rdAUtc(7, 35)).toEqual({ hora: 11, minuto: 35, dia: 0 });
    expect(rdAUtc(17, 5)).toEqual({ hora: 21, minuto: 5, dia: 0 });
    expect(rdAUtc(6, 40)).toEqual({ hora: 10, minuto: 40, dia: 0 });
    expect(rdAUtc(21, 30)).toEqual({ hora: 1, minuto: 30, dia: 1 });
  });

  it("las 4 ediciones a su hora RD, en UTC para pg_cron", () => {
    expect(cronUtc("am")).toBe("35 11 * * 1-5"); // 7:35 AM RD, lunes a viernes
    expect(cronUtc("cierre")).toBe("5 21 * * 1-5"); // 5:05 PM RD
    expect(cronUtc("finde")).toBe("35 11 * * 0,6"); // 7:35 AM RD, sábado y domingo
    expect(cronUtc("tasas")).toBe("40 10 * * 1"); // 6:40 AM RD, lunes
    expect(cronUtc("am", MINUTOS_REINTENTO)).toBe("45 11 * * 1-5");
  });

  it("llegan antes de la hora pedida (8:00 AM la AM y la de fin de semana, 7:00 AM la de tasas)", () => {
    expect(EDICIONES.am.hora * 60 + EDICIONES.am.minuto + MINUTOS_REINTENTO).toBeLessThan(8 * 60);
    expect(EDICIONES.finde.hora * 60 + EDICIONES.finde.minuto + MINUTOS_REINTENTO).toBeLessThan(8 * 60);
    expect(EDICIONES.tasas.hora * 60 + EDICIONES.tasas.minuto + MINUTOS_REINTENTO).toBeLessThan(7 * 60);
    // La de cierre sale después del cierre de EE. UU. (4:00 PM Nueva York = 4:00 o 5:00 PM RD según el horario de NY).
    expect(EDICIONES.cierre.hora * 60 + EDICIONES.cierre.minuto).toBeGreaterThan(17 * 60);
  });

  it("fecha y día de la semana en RD (de 8 PM a medianoche UTC ya es mañana)", () => {
    expect(fechaRD(new Date("2026-10-27T03:30:00Z"))).toBe("2026-10-26");
    expect(diaSemanaRD(new Date("2026-10-27T03:30:00Z"))).toBe(1);
    expect(fechaRD(new Date("2026-10-26T11:35:00Z"))).toBe("2026-10-26");
  });

  it("cada edición solo sale sus días", () => {
    const lunes = new Date("2026-10-26T11:35:00Z");
    const sabado = new Date("2026-10-24T11:35:00Z");
    const domingo = new Date("2026-10-25T11:35:00Z");
    const martes = new Date("2026-10-27T10:40:00Z");
    expect([tocaHoy("am", lunes), tocaHoy("am", sabado)]).toEqual([true, false]);
    expect([tocaHoy("finde", sabado), tocaHoy("finde", domingo), tocaHoy("finde", lunes)]).toEqual([true, true, false]);
    expect([tocaHoy("tasas", new Date("2026-10-26T10:40:00Z")), tocaHoy("tasas", martes)]).toEqual([true, false]);
  });

  it("clave de idempotencia: una por tipo y día; cada prueba aparte", () => {
    expect(claveIdempotencia("am", "2026-10-26")).toBe("strategya-boletin-am-2026-10-26");
    expect(claveIdempotencia("am", "2026-10-26", 41)).toBe("strategya-boletin-am-prueba-41");
  });
});

describe("migración del Boletín", () => {
  it("programa cada edición y su segunda pasada con la misma hora de este módulo, y la tarea existe en el registro", () => {
    for (const tipo of TIPOS_EDICION) {
      const tarea = nombreTarea(tipo);
      expect(buscarTarea(tarea), tarea).not.toBeNull();
      expect(MIGRACION).toContain(`select cron.schedule('strategya-${tarea}',`);
      expect(MIGRACION).toMatch(new RegExp(`'strategya-${tarea}',\\s+'${cronUtc(tipo).replace(/\*/g, "\\*")}'`));
      expect(MIGRACION).toMatch(new RegExp(`'strategya-${tarea}-reintento',\\s*'${cronUtc(tipo, MINUTOS_REINTENTO).replace(/\*/g, "\\*")}'`));
    }
    expect(buscarTarea("boletin-prueba")).not.toBeNull();
  });
});
