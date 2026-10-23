// Presupuesto como estado de resultados (migración 20261021000400_presupuesto.sql):
//   · la migración convierte los datos de la versión anterior sin perder nada;
//   · RLS y permisos de las funciones del contrato;
//   · personal.resultado_mes / presupuesto_ahorro_mensual dan lo mismo que lib/caja/resultados.ts;
//   · el caso de Mena (categorías + fijos + 1 movimiento) muestra presupuestado y real.
// Datos inventados (no son de Mena).

import Big from "big.js";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { COLUMNAS, type FilasCaja, filasADatos, ORDEN } from "../../lib/caja/filas";
import { aJsonSQL } from "../../lib/caja/importar";
import { estadoDeResultados, type EstadoResultados } from "../../lib/caja/resultados";
import type { ConfigCaja, DatosCaja } from "../../lib/caja/tipos";
import { como, debeFallar } from "./base";

const RAIZ = join(import.meta.dirname, "..", "..");
const URL_ADMIN = process.env.DATABASE_URL_PRUEBAS ?? "postgres://postgres:postgres@localhost:5432/postgres";
const MIGRACION = "20261021000400_presupuesto.sql";
const MENA = "11111111-1111-1111-1111-111111111111";
const INTRUSO = "22222222-2222-2222-2222-222222222222";
const TABLAS = ["caja_config", "caja_cuentas", "caja_categorias", "caja_recurrentes", "caja_movimientos", "caja_omitidos", "caja_saldos_reales", "caja_notas"] as const;

let pool: pg.Pool;

/** Base nueva con las migraciones ANTERIORES a la del presupuesto (para sembrar datos con la forma vieja). */
async function baseAntes(nombre: string): Promise<pg.Pool> {
  const admin = new pg.Client({ connectionString: URL_ADMIN });
  await admin.connect();
  await admin.query(`drop database if exists ${nombre} with (force)`);
  await admin.query(`create database ${nombre}`);
  await admin.end();
  const url = new URL(URL_ADMIN);
  url.pathname = `/${nombre}`;
  const p = new pg.Pool({ connectionString: url.toString(), max: 4 });
  await p.query(readFileSync(join(RAIZ, "pruebas", "db", "simulador-supabase.sql"), "utf8"));
  for (const a of migraciones().filter((x) => x < MIGRACION)) await p.query(leerMigracion(a));
  return p;
}
const migraciones = () => readdirSync(join(RAIZ, "supabase", "migrations")).filter((a) => a.endsWith(".sql")).sort();
const leerMigracion = (a: string) => readFileSync(join(RAIZ, "supabase", "migrations", a), "utf8").replace(/^create extension .*$/gim, "");

async function leer(c: pg.PoolClient | pg.Pool): Promise<FilasCaja> {
  const filas: Record<string, unknown>[][] = [];
  for (const t of TABLAS) {
    const orden = (ORDEN as Record<string, readonly string[]>)[t];
    filas.push((await c.query(`select ${COLUMNAS[t]} from personal.${t}${orden ? ` order by ${orden.join(", ")}` : ""}`)).rows);
  }
  const [config, cuentas, categorias, recurrentes, movimientos, omitidos, saldos, notas] = filas;
  return { config: config[0] ?? null, cuentas, categorias, recurrentes, movimientos, omitidos, saldos, notas };
}

beforeAll(async () => {
  pool = await baseAntes("strategya_pruebas_caja_presupuesto");
  await pool.query("insert into auth.users (id, email) values ($1, 'mena@ejemplo.do'), ($2, 'otro@ejemplo.do')", [MENA, INTRUSO]);
  await pool.query("insert into mercado.usuarios_autorizados (user_id) values ($1)", [MENA]);

  // Forma de la versión anterior: 4 cuentas, 12 categorías (con grupo y presupuesto total),
  // 3 fijos sin categoría + 1 enlazado, 1 movimiento. Igual en forma a lo que Mena tiene hoy.
  await pool.query(`
    insert into personal.caja_config (inicio, colchon, margen, tasa_usd) values ('2026-10-01', 10000, 3000, 60);
    insert into personal.caja_cuentas (id, nombre, tipo, saldo_inicial, orden) values
      ('b', 'Banco', 'banco', 50000, 1), ('e', 'Cartera', 'efectivo', 2000, 2), ('a', 'Ahorro', 'ahorro', 0, 3), ('v', 'Visa', 'tarjeta', 5000, 4);
    insert into personal.caja_categorias (id, nombre, grupo, presupuesto) values
      ('k1', 'Sueldo', 'ingreso', 80000), ('k2', 'Freelance', 'ingreso', null),
      ('k3', 'Alquiler', 'fijo', 22000), ('k4', 'Luz', 'fijo', 3000), ('k5', 'Internet', 'fijo', 2100),
      ('k6', 'Comida', 'variable', 12000.50), ('k7', 'Transporte', 'variable', 4000), ('k8', 'Salidas', 'variable', 0),
      ('k9', 'Ahorro', 'ahorro', 10000), ('k10', 'Inversión', 'ahorro', null),
      ('k11', 'Préstamo', 'deuda', 7500), ('k12', 'Tarjeta', 'deuda', 1500);
    insert into personal.caja_recurrentes (id, nombre, tipo, monto, cuenta, categoria, dias) values
      ('r1', 'Quincena', 'ingreso', 40000, 'b', null, '15, 30'),
      ('r2', 'Alquiler', 'gasto', 22000, 'b', null, '1'),
      ('r3', 'Préstamo', 'gasto', 7500, 'b', null, '20'),
      ('r4', 'Luz', 'gasto', 2800, 'b', 'k4', '10');
    insert into personal.caja_movimientos (id, fecha, tipo, monto, cuenta, categoria, nota) values
      ('m1', '2026-10-04', 'gasto', 1250.75, 'e', 'k6', 'Supermercado');
  `);
  await pool.query(leerMigracion(MIGRACION));
  // Las migraciones posteriores (si las hay) también se aplican.
  for (const a of migraciones().filter((x) => x > MIGRACION)) await pool.query(leerMigracion(a));
});

afterAll(async () => {
  await pool?.end();
});

describe("migración del presupuesto: convierte sin perder nada", () => {
  it("cada grupo viejo pasa a su tipo; el presupuesto pasa a adicional descontando sus fijos", async () => {
    const r = await pool.query("select id, tipo, adicional::text, grupo_v1, presupuesto_v1::text from personal.caja_categorias order by n");
    expect(r.rows).toEqual([
      { id: "k1", tipo: "ingreso", adicional: "80000", grupo_v1: "ingreso", presupuesto_v1: "80000" },
      { id: "k2", tipo: "ingreso", adicional: null, grupo_v1: "ingreso", presupuesto_v1: null },
      { id: "k3", tipo: "gasto", adicional: "22000", grupo_v1: "fijo", presupuesto_v1: "22000" },
      // Luz tenía presupuesto 3,000 y un fijo enlazado de 2,800: quedan 200 adicionales (total igual: 3,000).
      { id: "k4", tipo: "gasto", adicional: "200", grupo_v1: "fijo", presupuesto_v1: "3000" },
      { id: "k5", tipo: "gasto", adicional: "2100", grupo_v1: "fijo", presupuesto_v1: "2100" },
      { id: "k6", tipo: "gasto", adicional: "12000.50", grupo_v1: "variable", presupuesto_v1: "12000.50" },
      { id: "k7", tipo: "gasto", adicional: "4000", grupo_v1: "variable", presupuesto_v1: "4000" },
      { id: "k8", tipo: "gasto", adicional: null, grupo_v1: "variable", presupuesto_v1: "0" },
      { id: "k9", tipo: "ahorro_inversion", adicional: "10000", grupo_v1: "ahorro", presupuesto_v1: "10000" },
      { id: "k10", tipo: "ahorro_inversion", adicional: null, grupo_v1: "ahorro", presupuesto_v1: null },
      { id: "k11", tipo: "gasto_financiero", adicional: "7500", grupo_v1: "deuda", presupuesto_v1: "7500" },
      { id: "k12", tipo: "gasto_financiero", adicional: "1500", grupo_v1: "deuda", presupuesto_v1: "1500" },
    ]);
  });

  it("cuentas, fijos y el movimiento quedan intactos", async () => {
    const n = await pool.query(
      "select (select count(*) from personal.caja_cuentas)::int c, (select count(*) from personal.caja_categorias)::int k, (select count(*) from personal.caja_recurrentes)::int r, (select count(*) from personal.caja_movimientos)::int m",
    );
    expect(n.rows[0]).toEqual({ c: 4, k: 12, r: 4, m: 1 });
    const rec = await pool.query("select id, categoria, monto::text from personal.caja_recurrentes order by n");
    expect(rec.rows.map((x) => [x.id, x.categoria, x.monto])).toEqual([["r1", null, "40000"], ["r2", null, "22000"], ["r3", null, "7500"], ["r4", "k4", "2800"]]);
    const datos = filasADatos(await leer(pool));
    expect(datos.movimientos[0]).toMatchObject({ id: "m1", monto: "1250.75", categoria: "k6" });
  });

  it("el tipo es obligatorio y solo acepta los 7 del estado de resultados", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await debeFallar(c, "insert into personal.caja_categorias (nombre, tipo) values ('X', 'variable')", /caja_categorias_tipo_check/);
      await debeFallar(c, "insert into personal.caja_categorias (nombre) values ('X')", /null value in column "tipo"/);
      await debeFallar(c, "insert into personal.caja_categorias (nombre, tipo, adicional) values ('X', 'gasto', -1)", /check/);
      await c.query("insert into personal.caja_categorias (nombre, tipo, adicional) values ('Intereses', 'gasto_financiero', 1500)");
    });
  });
});

describe("caso de Mena: categorías + fijos + 1 movimiento → presupuestado y real", () => {
  it("el estado de resultados muestra lo presupuestado (fijos sin categoría incluidos) y lo real", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      const datos = filasADatos(await leer(c));
      const e = estadoDeResultados(datos, "2026-10");
      // Ingresos: Sueldo (adicional 80,000) + Quincena sin categoría (40,000 × 2).
      expect(e.secciones.ingreso.presupuestado).toBe("160000");
      // Gastos: adicionales 22,000 + 200 + 2,100 + 12,000.50 + 4,000 + Luz fija 2,800 + fijos sin categoría (alquiler y préstamo) 29,500.
      expect(new Big(e.secciones.gasto.presupuestado).eq("72600.5")).toBe(true);
      expect(e.secciones.gasto_financiero.presupuestado).toBe("9000"); // 7,500 + 1,500
      expect(e.secciones.gasto.real).toBe("1250.75");
      expect(e.sinCategoria.recurrentes).toBe(3);
      expect(e.vacio).toBe(false);
      const sql = (await c.query("select personal.resultado_mes('2026-10-15') as r")).rows[0].r;
      comparar(sql, e);
    });
  });

  it("al asignarle categoría al fijo, sale de «Sin categoría» y cae en su línea", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await c.query("update personal.caja_recurrentes set categoria = 'k1' where id = 'r1'");
      await c.query("update personal.caja_recurrentes set categoria = 'k11' where id = 'r3'");
      const e = estadoDeResultados(filasADatos(await leer(c)), "2026-10");
      expect(e.sinCategoria.recurrentes).toBe(1);
      expect(e.secciones.ingreso.lineas.find((l) => l.clave === "k1")).toMatchObject({ fijos: "80000", presupuestado: "160000" });
      expect(e.secciones.gasto_financiero.presupuestado).toBe("16500");
      comparar((await c.query("select personal.resultado_mes('2026-10-01') as r")).rows[0].r, e);
    });
  });
});

/** Un caso con todo: US$, reembolsos, mover a ahorro, cada N días, única y pago total. */
function datosCompletos(): DatosCaja & { config: ConfigCaja } {
  return {
    config: { inicio: "2026-09-15", colchon: "0", margen: "0", tasaUSD: "60.5" },
    cuentas: [
      { id: "b", nombre: "Banco", tipo: "banco", saldoInicial: "0", limite: null, orden: 0 },
      { id: "a", nombre: "Ahorro", tipo: "ahorro", saldoInicial: "0", limite: null, orden: 1 },
      { id: "v", nombre: "Visa", tipo: "tarjeta", saldoInicial: "0", limite: null, orden: 2 },
    ],
    categorias: [
      { id: "s", nombre: "Sueldo", tipo: "ingreso", adicional: null },
      { id: "m", nombre: "Mercancía", tipo: "costo", adicional: "3000" },
      { id: "c", nombre: "Comida", tipo: "gasto", adicional: "12000.25" },
      { id: "i", nombre: "Intereses", tipo: "gasto_financiero", adicional: null },
      { id: "o", nombre: "Regalos", tipo: "otro_ingreso", adicional: "1000" },
      { id: "g", nombre: "Multas", tipo: "otro_gasto", adicional: null },
      { id: "h", nombre: "Inversión", tipo: "ahorro_inversion", adicional: "2500" },
    ],
    recurrentes: [
      { id: "q", nombre: "Quincena", tipo: "ingreso", monto: "40000", moneda: "DOP", pagoTotal: false, cuenta: "b", destino: null, categoria: "s", frecuencia: "mensual", dias: "15, 31", cadaN: null, fecha: null, desde: null, hasta: null, activo: true },
      { id: "n", nombre: "Nube", tipo: "gasto", monto: "9.99", moneda: "USD", pagoTotal: false, cuenta: "v", destino: null, categoria: "c", frecuencia: "cada_n", dias: "", cadaN: 10, fecha: null, desde: null, hasta: null, activo: true },
      { id: "u", nombre: "Seguro", tipo: "gasto", monto: "3200", moneda: "DOP", pagoTotal: false, cuenta: "b", destino: null, categoria: "i", frecuencia: "unica", dias: "", cadaN: null, fecha: "2026-11-02", desde: null, hasta: null, activo: true },
      { id: "f", nombre: "Fondo", tipo: "transferencia", monto: "1500", moneda: "DOP", pagoTotal: false, cuenta: "b", destino: "a", categoria: null, frecuencia: "mensual", dias: "20", cadaN: null, fecha: null, desde: null, hasta: null, activo: true },
      { id: "p", nombre: "Pago Visa", tipo: "pago_tarjeta", monto: "0", moneda: "DOP", pagoTotal: true, cuenta: "b", destino: "v", categoria: null, frecuencia: "mensual", dias: "28", cadaN: null, fecha: null, desde: null, hasta: null, activo: true },
      { id: "x", nombre: "Pausado", tipo: "gasto", monto: "999", moneda: "DOP", pagoTotal: false, cuenta: "b", destino: null, categoria: "c", frecuencia: "mensual", dias: "5", cadaN: null, fecha: null, desde: null, hasta: null, activo: false },
    ],
    movimientos: [
      { id: "1", fecha: "2026-11-15", tipo: "ingreso", monto: "40000", moneda: "DOP", tasa: null, cuenta: "b", destino: null, categoria: "s", nota: null, recurrenteId: "q" },
      { id: "2", fecha: "2026-11-03", tipo: "gasto", monto: "2500.5", moneda: "DOP", tasa: null, cuenta: "b", destino: null, categoria: "c", nota: null, recurrenteId: null },
      { id: "3", fecha: "2026-11-04", tipo: "gasto", monto: "20", moneda: "USD", tasa: "59.8", cuenta: "v", destino: null, categoria: "c", nota: null, recurrenteId: null },
      { id: "4", fecha: "2026-11-05", tipo: "ingreso", monto: "300", moneda: "DOP", tasa: null, cuenta: "b", destino: null, categoria: "c", nota: "reembolso", recurrenteId: null },
      { id: "5", fecha: "2026-11-06", tipo: "gasto", monto: "1200", moneda: "DOP", tasa: null, cuenta: "b", destino: null, categoria: "m", nota: null, recurrenteId: null },
      { id: "6", fecha: "2026-11-07", tipo: "gasto", monto: "850", moneda: "DOP", tasa: null, cuenta: "b", destino: null, categoria: "i", nota: null, recurrenteId: null },
      { id: "7", fecha: "2026-11-08", tipo: "ingreso", monto: "2500", moneda: "DOP", tasa: null, cuenta: "b", destino: null, categoria: "o", nota: null, recurrenteId: null },
      { id: "8", fecha: "2026-11-09", tipo: "gasto", monto: "700", moneda: "DOP", tasa: null, cuenta: "b", destino: null, categoria: "g", nota: null, recurrenteId: null },
      { id: "9", fecha: "2026-11-20", tipo: "transferencia", monto: "1500", moneda: "DOP", tasa: null, cuenta: "b", destino: "a", categoria: null, nota: null, recurrenteId: "f" },
      { id: "10", fecha: "2026-11-21", tipo: "transferencia", monto: "2000", moneda: "DOP", tasa: null, cuenta: "b", destino: "b2", categoria: "h", nota: null, recurrenteId: null },
      { id: "11", fecha: "2026-11-22", tipo: "gasto", monto: "450", moneda: "DOP", tasa: null, cuenta: "b", destino: null, categoria: null, nota: null, recurrenteId: null },
      { id: "12", fecha: "2026-11-23", tipo: "pago_tarjeta", monto: "5000", moneda: "DOP", tasa: null, cuenta: "b", destino: "v", categoria: null, nota: null, recurrenteId: null },
      { id: "13", fecha: "2026-11-24", tipo: "gasto", monto: "5", moneda: "USD", tasa: null, cuenta: "b", destino: null, categoria: "c", nota: null, recurrenteId: null },
      { id: "14", fecha: "2026-12-01", tipo: "gasto", monto: "99999", moneda: "DOP", tasa: null, cuenta: "b", destino: null, categoria: "c", nota: null, recurrenteId: null },
    ],
    omitidos: [],
    saldos: [],
    notas: [],
  };
}

const CLAVES = [
  ["ingresos", (e: EstadoResultados) => e.secciones.ingreso],
  ["costos", (e: EstadoResultados) => e.secciones.costo],
  ["gastos", (e: EstadoResultados) => e.secciones.gasto],
  ["gastos_financieros", (e: EstadoResultados) => e.secciones.gasto_financiero],
  ["otros_ingresos", (e: EstadoResultados) => e.secciones.otro_ingreso],
  ["otros_gastos", (e: EstadoResultados) => e.secciones.otro_gasto],
  ["gastos_totales", (e: EstadoResultados) => e.gastosTotales],
  ["utilidad_bruta", (e: EstadoResultados) => e.utilidadBruta],
  ["utilidad_operativa", (e: EstadoResultados) => e.utilidadOperativa],
  ["utilidad_neta", (e: EstadoResultados) => e.utilidadNeta],
  ["ahorro", (e: EstadoResultados) => e.secciones.ahorro_inversion],
  ["disponible", (e: EstadoResultados) => e.disponible],
] as const;

/** La función SQL y la de TypeScript dan lo mismo, clave por clave (montos como texto exacto). */
function comparar(sql: { mes: string; presupuestado: Record<string, unknown>; real: Record<string, unknown> }, e: EstadoResultados) {
  expect(sql.mes).toBe(e.mes);
  for (const [k, de] of CLAVES) {
    for (const lado of ["presupuestado", "real"] as const) {
      const v = sql[lado][k];
      expect(typeof v, `${lado}.${k} debe ser texto`).toBe("string");
      expect(new Big(v as string).eq(de(e)[lado]), `${lado}.${k}: SQL ${String(v)} ≠ TS ${de(e)[lado]}`).toBe(true);
    }
  }
}

describe("contrato para el Portafolio: resultado_mes y presupuesto_ahorro_mensual", () => {
  it("dan lo mismo que el estado de resultados de la pantalla (US$, reembolsos, ahorro, cada N, única)", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await c.query("select personal.caja_importar($1::jsonb)", [JSON.stringify(aJsonSQL(datosCompletos()))]);
      const datos = filasADatos(await leer(c));
      for (const mes of ["2026-09", "2026-10", "2026-11", "2026-12", "2027-02"]) {
        const e = estadoDeResultados(datos, mes);
        comparar((await c.query("select personal.resultado_mes($1::date) as r", [`${mes}-10`])).rows[0].r, e);
        const ahorro = (await c.query("select personal.presupuesto_ahorro_mensual($1::date)::text as a", [`${mes}-01`])).rows[0].a;
        expect(new Big(ahorro).eq(e.secciones.ahorro_inversion.presupuestado)).toBe(true);
      }
      // Noviembre con cifras a mano: el seguro único cae el 2; la nube cada 10 días desde el inicio (15 sep).
      const nov = estadoDeResultados(datos, "2026-11");
      expect(nov.secciones.ingreso.presupuestado).toBe("80000"); // el 31 cae el 30
      expect(nov.secciones.gasto_financiero.presupuestado).toBe("3200");
      expect(nov.secciones.ahorro_inversion).toMatchObject({ presupuestado: "4000", real: "3500" });
      // 2,500.5 + 20 × 59.8 − 300 (reembolso) + 5 × 60.5 (US$ con la tasa general) + 450 sin categoría.
      expect(nov.secciones.gasto.real).toBe("4149");
    });
  });

  it("sin datos del mes: ceros, nunca null", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await c.query("delete from personal.caja_movimientos; delete from personal.caja_recurrentes; update personal.caja_categorias set adicional = null");
      const r = (await c.query("select personal.resultado_mes('2030-01-01') as r")).rows[0].r;
      expect(r.mes).toBe("2030-01");
      expect(r.presupuestado.utilidad_neta).toBe("0");
      expect(r.real.ahorro).toBe("0");
      expect((await c.query("select personal.presupuesto_ahorro_mensual('2030-01-01')::text as a")).rows[0].a).toBe("0");
    });
  });

  it("SECURITY INVOKER con RLS: otro usuario ve ceros; anon no puede llamarlas", async () => {
    const definer = await pool.query(
      "select proname, prosecdef from pg_proc where pronamespace = 'personal'::regnamespace and proname in ('resultado_mes', 'presupuesto_ahorro_mensual', 'caja_fijos_mes') order by proname",
    );
    expect(definer.rows).toEqual([
      { proname: "caja_fijos_mes", prosecdef: false },
      { proname: "presupuesto_ahorro_mensual", prosecdef: false },
      { proname: "resultado_mes", prosecdef: false },
    ]);
    await como(pool, "authenticated", INTRUSO, async (c) => {
      const r = (await c.query("select personal.resultado_mes('2026-10-01') as r")).rows[0].r;
      for (const lado of ["presupuestado", "real"]) for (const v of Object.values(r[lado])) expect(new Big(v as string).eq(0)).toBe(true);
      expect((await c.query("select personal.presupuesto_ahorro_mensual('2026-10-01')::text as a")).rows[0].a).toBe("0");
    });
    await como(pool, "anon", null, async (c) => {
      await debeFallar(c, "select personal.resultado_mes('2026-10-01')", /permission denied/);
      await debeFallar(c, "select personal.presupuesto_ahorro_mensual('2026-10-01')", /permission denied/);
    });
    // Mena sí ve lo suyo.
    await como(pool, "authenticated", MENA, async (c) => {
      const r = (await c.query("select personal.resultado_mes('2026-10-01') as r")).rows[0].r;
      expect(new Big(r.presupuestado.ingresos).gt(0)).toBe(true);
    });
  });
});
