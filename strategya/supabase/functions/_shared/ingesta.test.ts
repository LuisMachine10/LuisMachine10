import { describe, expect, it } from "vitest";
import { type Almacen, correrTarea, type Tarea, validarFila } from "./ingesta.ts";
import { claveServidor, secretoValido } from "./seguridad.ts";

function almacenFalso(opciones: { fallaAlCerrar?: boolean } = {}) {
  const cierres: unknown[] = [];
  const almacen: Almacen = {
    iniciarCorrida: async () => 42,
    terminarCorrida: async (_id, c) => {
      if (opciones.fallaAlCerrar) throw new Error("base caída");
      cierres.push(c);
    },
    registrarObservaciones: async (_id, f) => ({ recibidas: f.length, insertadas: f.length, actualizadas: 0 }),
    guardar: async (_t, f) => f.length,
    rpc: async () => null as never,
  };
  return { almacen, cierres };
}

const sinRed = { obtener: async () => Promise.reject(new Error("no se usa")) };

describe("correrTarea", () => {
  it("registra la excepción de la tarea en la corrida, no la deja escapar", async () => {
    const { almacen, cierres } = almacenFalso();
    const tarea: Tarea = { nombre: "t", fuenteId: "f", ejecutar: async () => Promise.reject(new Error("se rompió")) };
    const r = await correrTarea(tarea, almacen, sinRed);
    expect(r).toMatchObject({ corridaId: 42, estado: "error", error: "se rompió", filas: 0 });
    expect(cierres).toHaveLength(1);
  });

  it("rechaza una fila con número mal formado antes de tocar la base", async () => {
    const { almacen } = almacenFalso();
    const tarea: Tarea = {
      nombre: "t",
      fuenteId: "f",
      ejecutar: async (ctx) => {
        await ctx.registrar([{ serie_id: "UST_10A", valor: "5,19", fecha_dato: "2026-10-14" }]);
        return {};
      },
    };
    const r = await correrTarea(tarea, almacen, sinRed);
    expect(r.estado).toBe("error");
    expect(r.error).toMatch(/valor no numérico «5,19»/);
  });

  it("si no puede cerrar la corrida lo reporta en el resumen", async () => {
    const { almacen } = almacenFalso({ fallaAlCerrar: true });
    const r = await correrTarea({ nombre: "t", fuenteId: "f", ejecutar: async () => ({}) }, almacen, sinRed);
    expect(r).toMatchObject({ estado: "error", error: "No se pudo cerrar la corrida: base caída" });
  });
});

describe("validarFila", () => {
  it("acepta decimales con punto y negativos; rechaza coma, notación científica y fechas raras", () => {
    const ok = { serie_id: "S", valor: "-0.05", fecha_dato: "2026-10-14" };
    expect(validarFila(ok)).toBeNull();
    expect(validarFila({ ...ok, valor: "1e3" })).toMatch(/no numérico/);
    expect(validarFila({ ...ok, valor: "4,10" })).toMatch(/no numérico/);
    expect(validarFila({ ...ok, fecha_dato: "14/10/2026" })).toMatch(/fecha inválida/);
    expect(validarFila({ ...ok, cambio: "abc" })).toMatch(/cambio no numérico/);
  });
});

describe("seguridad", () => {
  const secreto = "a".repeat(40);
  it("acepta solo el secreto exacto y exige uno largo", () => {
    expect(secretoValido(secreto, secreto)).toBe(true);
    expect(secretoValido(`${secreto.slice(0, -1)}b`, secreto)).toBe(false);
    expect(secretoValido(null, secreto)).toBe(false);
    expect(secretoValido("corto", "corto")).toBe(false);
    expect(secretoValido(secreto, undefined)).toBe(false);
  });

  it("toma la clave de servidor del formato viejo o del nuevo", () => {
    expect(claveServidor((n) => ({ SUPABASE_SERVICE_ROLE_KEY: "vieja" })[n])).toBe("vieja");
    expect(claveServidor((n) => ({ SUPABASE_SECRET_KEYS: '{"default":"sb_secret_x"}' })[n])).toBe("sb_secret_x");
    expect(() => claveServidor(() => undefined)).toThrow(/Falta la clave/);
  });
});
