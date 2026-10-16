import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buscarTarea } from "./tareas.ts";

const MIGRACIONES = join(import.meta.dirname, "..", "..", "migrations");

/** Tareas que pg_cron manda a la Edge Function ingesta, leídas de las migraciones. */
function tareasProgramadas(): string[] {
  const nombres = new Set<string>();
  for (const archivo of readdirSync(MIGRACIONES).filter((a) => a.endsWith(".sql"))) {
    const sql = readFileSync(join(MIGRACIONES, archivo), "utf8");
    for (const m of sql.matchAll(/invocar_tarea\(\s*'ingesta'\s*,\s*'\{\s*"tarea"\s*:\s*"([a-z0-9-]+)"/g)) nombres.add(m[1]);
  }
  return [...nombres].sort();
}

describe("registro de tareas", () => {
  it("cada tarea programada con pg_cron existe en el registro", () => {
    const programadas = tareasProgramadas();
    expect(programadas.length).toBeGreaterThan(20);
    expect(programadas.filter((n) => !buscarTarea(n))).toEqual([]);
  });

  it("no acepta nombres que no son tareas", () => {
    expect(buscarTarea("toString")).toBeNull();
    expect(buscarTarea(42)).toBeNull();
  });
});
