import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { almacenMemoria } from "../../../../pruebas/apoyo/almacen-memoria.ts";
import type { Respuesta } from "../http.ts";
import { correrTarea } from "../ingesta.ts";
import {
  fechaDMA,
  fechaEnLetras,
  parsearExcel,
  parsearReservas,
  soloCambios,
  tareaFondosSafis,
  URL_EXCEL_FONDOS,
} from "./fondos-safis.ts";

// Páginas REALES del 16 oct 2026 (sondas/lotes/hechos/33-safis-fondos.txt).
const M = (n: string) => readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "pruebas", "muestras", "safis", n), "utf8");
const EXCEL = M("excel-fondosabiertos-real-2026-10-16.html");
const LARIMAR = M("afireservas-larimar-real-2026-10-16.html");
const CAOBA = M("afireservas-caoba-real-2026-10-16.html");
const ok = (url: string, texto: string): Respuesta => ({ url, status: 200, tipo: "text/html", texto, intentos: 1 });

describe("fechas", () => {
  it("en letras y día/mes/año", () => {
    expect(fechaEnLetras("4 de octubre de 2026")).toBe("2026-10-04");
    expect(fechaEnLetras("31 de setiembre del 2026")).toBe("2026-09-31");
    expect(fechaEnLetras("octubre 2026")).toBeNull();
    expect(fechaDMA("04/10/2026")).toBe("2026-10-04");
    expect(fechaDMA("10/13/2026")).toBeNull();
  });
});

describe("Excel", () => {
  it("20 rendimientos (2 fondos × 2 monedas × 5 plazos) con fecha y valor cuota del mismo día", () => {
    const { filas, advertencias } = parsearExcel(EXCEL);
    expect(advertencias).toEqual([]);
    expect(filas).toHaveLength(20);
    expect(filas.find((f) => f.fondo === "Fondo Abierto Dinámico Excel" && f.moneda === "DOP" && f.plazo_dias === 60)).toEqual({
      safi: "Excel SAFI",
      fondo: "Fondo Abierto Dinámico Excel",
      moneda: "DOP",
      plazo_dias: 60,
      rendimiento: "8.57",
      fecha_corte: "2026-10-04",
      valor_cuota: "1589.23",
      url_fuente: URL_EXCEL_FONDOS,
      nota: "Rentabilidad anualizada publicada por la SAFI",
    });
    const liqUsd = filas.find((f) => f.fondo === "Fondo Abierto de Liquidez Excel" && f.moneda === "USD" && f.plazo_dias === 365)!;
    expect(liqUsd).toMatchObject({ rendimiento: "3.42", valor_cuota: "125.25" });
  });

  it("formato cambiado: error claro", () => {
    expect(() => parsearExcel("<html>nada</html>")).toThrow(/formato inesperado/);
  });
});

describe("AFI Reservas", () => {
  it("Larimar: pesos, 4 plazos, fecha = día en que se vio", () => {
    const r = parsearReservas(LARIMAR, "https://www.afireservas.com/fondos/fondo-larimar/", "2026-10-16");
    expect(r.fondo).toBe("Fondo Mutuo Reservas Larimar");
    expect(r.moneda).toBe("DOP");
    expect(r.filas.map((f) => [f.plazo_dias, f.rendimiento])).toEqual([[30, "8.65"], [90, "4.24"], [180, "5.27"], [365, "7.19"]]);
    expect(r.filas[0].nota).toMatch(/no publica fecha de corte/);
  });

  it("Caoba: dólares; la volatilidad no se confunde con la rentabilidad", () => {
    const r = parsearReservas(CAOBA, "https://www.afireservas.com/fondos/fondo-caoba/", "2026-10-16");
    expect(r.moneda).toBe("USD");
    expect(r.filas).toHaveLength(4);
    expect(r.filas.every((f) => !f.rendimiento.includes("%"))).toBe(true);
  });

  it("sin moneda confirmable: no se guarda", () => {
    const sin = LARIMAR.replaceAll("en pesos", "en cuotas");
    expect(() => parsearReservas(sin, "https://x/", "2026-10-16")).toThrow(/moneda/);
  });

  it("solo cambios respecto de lo último guardado", () => {
    const filas = parsearReservas(LARIMAR, "https://x/", "2026-10-17").filas;
    const ultimos = [
      { fondo: "Fondo Mutuo Reservas Larimar", moneda: "DOP", plazo_dias: 30, rendimiento: "8.65" },
      { fondo: "Fondo Mutuo Reservas Larimar", moneda: "DOP", plazo_dias: 90, rendimiento: "4.10" },
    ];
    expect(soloCambios(filas, ultimos).map((f) => f.plazo_dias)).toEqual([90, 180, 365]);
  });
});

describe("tarea fondos-safis", () => {
  it("guarda Excel y Reservas como automáticos con su fuente", async () => {
    const { almacen, tablas } = almacenMemoria({ rpc: () => [] });
    const r = await correrTarea(tareaFondosSafis, almacen, {
      ahora: () => new Date("2026-10-16T22:10:00Z"),
      obtener: async (url) => ok(url, url === URL_EXCEL_FONDOS ? EXCEL : url.includes("caoba") ? CAOBA : LARIMAR),
    });
    expect(r.estado).toBe("ok");
    const filas = tablas.fondos_rendimientos;
    expect(filas.filter((f) => f.fuente_id === "excel_fondos")).toHaveLength(20);
    // Quisqueya usa aquí la página de Larimar: el fondo repetido se guarda una sola vez.
    expect(filas.filter((f) => f.fuente_id === "afi_reservas")).toHaveLength(8);
    expect(filas.every((f) => f.origen === "automatica")).toBe(true);
    expect(filas.find((f) => f.fuente_id === "afi_reservas")?.fecha_corte).toBe("2026-10-16");
  });

  it("si todo falla: error con el motivo, nada inventado", async () => {
    const { almacen } = almacenMemoria({ rpc: () => [] });
    const r = await correrTarea(tareaFondosSafis, almacen, {
      obtener: async () => { throw new Error("HTTP 503"); },
    });
    expect(r.estado).toBe("error");
    expect(r.error).toMatch(/HTTP 503/);
  });
});
