import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { leerXlsx } from "../../supabase/functions/_shared/xlsx.ts";
import { parsearConsolidado, parsearSubastas, unirConsolidado } from "../../supabase/functions/_shared/fuentes/credito-publico.ts";
import { leerResumenSubasta } from "./subasta.ts";

// Texto real: el que la tarea credito-publico arma con las muestras guardadas de Crédito Público.
const M = join(import.meta.dirname, "..", "..", "pruebas", "muestras", "credito-publico");
const html = readFileSync(join(M, "subastas-2026.html"), "utf8");
const consolidado = parsearConsolidado(leerXlsx(new Uint8Array(readFileSync(join(M, "02Consolidado-2026-real-2026-10-16.xlsx")))));
const s = parsearSubastas(html);
const filas = unirConsolidado(s.subastas, consolidado.filas, s.consolidado!).filas as { fecha: string; descripcion: string }[];
const de = (fecha: string) => filas.find((f) => f.fecha === fecha)!.descripcion;

describe("leerResumenSubasta", () => {
  it("separa subastado, demandado, cobertura y vencimiento del resumen del Consolidado", () => {
    expect(leerResumenSubasta(de("2026-03-05"))).toEqual({
      subastadoMM: "30,000.0",
      demandadoMM: "134,015.4",
      cobertura: "4.47",
      vence: "2041-03-10",
      aviso: null,
    });
  });

  it("conserva el aviso cuando el vencimiento no cuadra con el código del título", () => {
    const r = leerResumenSubasta(de("2026-09-08"));
    expect(r.aviso).toMatch(/^El Consolidado indica vencimiento 2026-09-11, que no coincide .*revisar el PDF oficial\.$/);
  });

  it("sin resumen no inventa nada", () => {
    expect(leerResumenSubasta(null)).toEqual({ subastadoMM: null, demandadoMM: null, cobertura: null, vence: null, aviso: null });
    expect(leerResumenSubasta("Segunda ronda. Monto y tasa de corte: ver el PDF oficial.").cobertura).toBeNull();
  });
});
