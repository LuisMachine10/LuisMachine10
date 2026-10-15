import { describe, expect, it } from "vitest";
// @ts-expect-error: módulo .mjs sin tipos
import { clavesDe, elegirProyecto, migracionesLocales, secretoTareas, secretosFuncion, sqlMigracion } from "./desplegar.mjs";

describe("despliegue", () => {
  it("elige el proyecto pedido, el llamado strategya o el único", () => {
    const a = { ref: "aaa", name: "otro" };
    const b = { ref: "bbb", name: "Strategya" };
    expect(elegirProyecto([a, b], undefined)).toBe(b);
    expect(elegirProyecto([a], undefined)).toBe(a);
    expect(elegirProyecto([a, { ref: "ccc", name: "x" }], undefined)).toBeNull();
    expect(elegirProyecto([a, b], "aaa")).toBe(a);
    expect(elegirProyecto([a, b], "zzz")).toBeNull();
    expect(elegirProyecto([], undefined)).toBeNull();
  });

  it("el secreto de tareas es estable y distinto por proyecto", () => {
    expect(secretoTareas("t", "r1")).toBe(secretoTareas("t", "r1"));
    expect(secretoTareas("t", "r1")).not.toBe(secretoTareas("t", "r2"));
    expect(secretoTareas("t", "r1")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("toma la clave publicable y la de servidor, con o sin claves nuevas", () => {
    expect(clavesDe([{ name: "anon", api_key: "A" }, { name: "service_role", api_key: "S" }])).toEqual({ publica: "A", servidor: "S" });
    expect(
      clavesDe([
        { name: "anon", api_key: "A" },
        { name: "service_role", api_key: "S" },
        { type: "publishable", name: "default", api_key: "sb_publishable_x" },
      ]),
    ).toEqual({ publica: "sb_publishable_x", servidor: "S" });
  });

  it("las migraciones se aplican en orden y quedan registradas en una transacción", () => {
    const m = migracionesLocales();
    expect(m.length).toBeGreaterThan(0);
    expect(m.map((x: { version: string }) => x.version)).toEqual([...m.map((x: { version: string }) => x.version)].sort());
    const sql = sqlMigracion("20261015000100", "esquema_base", "select 1;");
    expect(sql.startsWith("begin;")).toBe(true);
    expect(sql.trim().endsWith("commit;")).toBe(true);
    expect(sql).toContain("'20261015000100', 'esquema_base'");
  });

  it("pasa a la función solo los secretos presentes, y el correo solo como destino y contacto SEC", () => {
    const s = secretosFuncion({ FMP_API_KEY: "f", STRATEGYA_EMAIL: "m@x.do" }, "sec");
    const nombres = s.map((x: { name: string }) => x.name);
    expect(nombres).toEqual([
      "STRATEGYA_SECRETO_TAREAS", "FMP_API_KEY", "ALERTAS_EMAIL_DESTINO", "STRATEGYA_CONTACTO", "IA_TOPE_MENSUAL_USD", "FMP_LLAMADAS_DIA",
    ]);
    expect(nombres).not.toContain("FINNHUB_API_KEY");
  });
});
