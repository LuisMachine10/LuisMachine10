// Tarea precios-cartera de punta a punta sin red: símbolos de personal.activos → Finnhub (simulado con
// la muestra SINTÉTICA) → mercado.cotizaciones_cartera → corrida visible en /estado.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tareaPreciosCartera } from "../../supabase/functions/_shared/fuentes/precios-cartera.ts";
import { correrTarea } from "../../supabase/functions/_shared/ingesta.ts";
import { almacenPg } from "./almacen-pg";
import { baseNueva } from "./base";

// SINTÉTICA: reemplazar por real (pruebas/muestras/finnhub-cartera/LEEME-SINTETICA.txt).
const QUOTE = readFileSync(join(import.meta.dirname, "..", "muestras", "finnhub-cartera", "quote-EJEMPLO-SINTETICA.json"), "utf8");

let pool: pg.Pool;

beforeAll(async () => {
  pool = await baseNueva("strategya_pruebas_capital_precios");
  await pool.query(
    "insert into personal.activos (id, clase, nombre, moneda, cantidad, simbolo) values ('a1', 'rentavariable', 'Ejemplo', 'USD', 1, 'EJEMPLO')",
  );
});

afterAll(async () => {
  await pool?.end();
});

const dependencias = (clave: string | undefined) => ({
  ahora: () => new Date("2026-10-15T21:30:00Z"),
  obtener: async () => {
    throw new Error("no usa obtener");
  },
  api: async (url: string) => ({ url, status: 200, tipo: "application/json", texto: QUOTE, intentos: 1 }),
  entorno: (n: string) => (n === "FINNHUB_API_KEY" ? clave : undefined),
});

describe("precios-cartera de punta a punta", () => {
  it("sin clave: corrida parcial, nada guardado", async () => {
    const r = await correrTarea(tareaPreciosCartera, almacenPg(pool), dependencias(undefined));
    expect(r.estado).toBe("parcial");
    expect((await pool.query("select count(*)::int as n from mercado.cotizaciones_cartera")).rows[0].n).toBe(0);
  });

  it("con clave: guarda el precio exacto y es idempotente", async () => {
    const r = await correrTarea(tareaPreciosCartera, almacenPg(pool), dependencias("k"));
    expect(r.estado).toBe("ok");
    const again = await correrTarea(tareaPreciosCartera, almacenPg(pool), dependencias("k"));
    expect(again.estado).toBe("ok");
    const { rows } = await pool.query(
      "select simbolo, fecha::text, precio::text, cierre_anterior::text, fuente, url_dato from mercado.cotizaciones_cartera",
    );
    expect(rows).toEqual([
      { simbolo: "EJEMPLO", fecha: "2026-10-15", precio: "101.37", cierre_anterior: "102.2", fuente: "finnhub", url_dato: "https://finnhub.io/api/v1/quote?symbol=EJEMPLO" },
    ]);
    const estado = await pool.query("select estado from mercado.estado_tareas where tarea = 'precios-cartera'");
    expect(estado.rows[0].estado).toBe("ok");
  });
});
