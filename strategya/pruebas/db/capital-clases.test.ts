// Migración de Mena Capital a las 4 clases (20261017000100_capital_clases.sql) contra Postgres real:
// datos guardados con las clases anteriores pasan a Efectivo / Cuentas de Ahorro / Renta Fija /
// Renta Variable, las metas de la política se traducen y el CHECK nuevo rechaza lo demás.
// Datos SINTÉTICOS (cifras redondas inventadas).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { como, debeFallar } from "./base";

const RAIZ = join(import.meta.dirname, "..", "..");
const URL_ADMIN = process.env.DATABASE_URL_PRUEBAS ?? "postgres://postgres:postgres@localhost:5432/postgres";
const MIGRACION = "20261017000100_capital_clases.sql";
const MENA = "11111111-1111-1111-1111-111111111111";

let pool: pg.Pool;

function sql(archivo: string): string {
  return readFileSync(join(RAIZ, "supabase", "migrations", archivo), "utf8").replace(/^create extension .*$/gim, "");
}

beforeAll(async () => {
  const nombre = "strategya_pruebas_capital_clases";
  const admin = new pg.Client({ connectionString: URL_ADMIN });
  await admin.connect();
  await admin.query(`drop database if exists ${nombre} with (force)`);
  await admin.query(`create database ${nombre}`);
  await admin.end();
  const url = new URL(URL_ADMIN);
  url.pathname = `/${nombre}`;
  pool = new pg.Pool({ connectionString: url.toString(), max: 4 });
  await pool.query(readFileSync(join(RAIZ, "pruebas", "db", "simulador-supabase.sql"), "utf8"));

  // Todas las migraciones anteriores a la de las 4 clases, como estaba la base en producción.
  const todas = readdirSync(join(RAIZ, "supabase", "migrations")).filter((a) => a.endsWith(".sql")).sort();
  for (const a of todas.filter((x) => x < MIGRACION)) await pool.query(sql(a));

  // Datos guardados con las clases viejas.
  await pool.query(`insert into personal.activos (id, clase, nombre, moneda, cantidad, simbolo, tipo_rf, vencimiento) values
    ('e1', 'efectivo', 'Caja', 'DOP', '100', null, null, null),
    ('h1', 'ahorros', 'Cuenta', 'DOP', '200.50', null, null, null),
    ('r1', 'rentafija', 'Certificado', 'DOP', '300', null, 'acumula', '2027-01-31'),
    ('v1', 'accionesusa', 'ETF', 'USD', '2', 'ABC', null, null)`);
  await pool.query(`insert into personal.parametros (id, datos) values (1,
    '{"inflacion": "0.04", "metaAsignacion": {"efectivo": "0.1", "ahorros": "0.15", "rentafija": "0.45", "accionesusa": "0.3"}}')`);

  for (const a of todas.filter((x) => x >= MIGRACION)) await pool.query(sql(a));

  await pool.query("insert into auth.users (id, email) values ($1, 'mena@ejemplo.do')", [MENA]);
  await pool.query("insert into mercado.usuarios_autorizados (user_id) values ($1)", [MENA]);
});

afterAll(async () => {
  await pool?.end();
});

describe("Mena Capital · las 4 clases", () => {
  it("las clases guardadas pasan a las 4 nuevas sin tocar las cifras", async () => {
    const { rows } = await pool.query("select id, clase, cantidad::text, tipo_rf, vencimiento::text from personal.activos order by id");
    expect(rows).toEqual([
      { id: "e1", clase: "efectivo", cantidad: "100", tipo_rf: null, vencimiento: null },
      { id: "h1", clase: "ahorros", cantidad: "200.50", tipo_rf: null, vencimiento: null },
      { id: "r1", clase: "rentafija", cantidad: "300", tipo_rf: "acumula", vencimiento: "2027-01-31" },
      { id: "v1", clase: "rentavariable", cantidad: "2", tipo_rf: null, vencimiento: null },
    ]);
  });

  it("las metas de la política quedan por las 4 clases, como texto decimal", async () => {
    const { rows } = await pool.query("select datos from personal.parametros where id = 1");
    expect(rows[0].datos.metaAsignacion).toEqual({ efectivo: "0.1", ahorros: "0.15", rentafija: "0.45", rentavariable: "0.3" });
    expect(rows[0].datos.inflacion).toBe("0.04");
  });

  it("el CHECK nuevo solo admite las 4 clases", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await debeFallar(c, "insert into personal.activos (id, clase, nombre, moneda, cantidad) values ('x', 'accionesusa', 'X', 'DOP', 1)", /check constraint/);
      await debeFallar(c, "insert into personal.activos (id, clase, nombre, moneda, cantidad) values ('y', 'cripto', 'Y', 'DOP', 1)", /check constraint/);
      await c.query("insert into personal.activos (id, clase, nombre, moneda, cantidad) values ('z', 'rentavariable', 'Z', 'USD', 1)");
    });
  });

  it("clase_capital traduce los nombres del artefacto y los comunes; lo ambiguo queda igual", async () => {
    const { rows } = await pool.query(
      `select x, personal.clase_capital(x) as c from unnest(array['accionesusa', 'Acciones EE. UU.', 'Bonos', 'Fondo de renta fija',
        'Cuentas de Ahorro', 'ETF', 'efectivo', 'fondo', 'mixto']) as x`,
    );
    expect(Object.fromEntries(rows.map((r) => [r.x, r.c]))).toEqual({
      accionesusa: "rentavariable",
      "Acciones EE. UU.": "rentavariable",
      Bonos: "rentafija",
      "Fondo de renta fija": "rentafija",
      "Cuentas de Ahorro": "ahorros",
      ETF: "rentavariable",
      efectivo: "efectivo",
      fondo: "fondo",
      mixto: "mixto",
    });
  });

  it("la importación traduce las clases y la ingesta ve los símbolos de Renta Variable", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      const carga = {
        activos: [
          { id: "a", clase: "accionesusa", nombre: "ETF", moneda: "USD", cantidad: "1", simbolo: "XYZ", tipo_rf: "cupon" },
          { id: "b", clase: "bonos", nombre: "Bono", moneda: "DOP", cantidad: "1", tipo_rf: "cupon" },
        ],
      };
      await c.query("select personal.importar_capital($1::jsonb)", [JSON.stringify(carga)]);
      const { rows } = await c.query("select id, clase, tipo_rf from personal.activos order by id");
      expect(rows).toEqual([
        { id: "a", clase: "rentavariable", tipo_rf: null },
        { id: "b", clase: "rentafija", tipo_rf: "cupon" },
      ]);
      await c.query("set local role service_role");
      expect((await c.query("select mercado.simbolos_cartera() as s")).rows[0].s).toEqual(["XYZ"]);
    });
  });
});
