import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const RAIZ = join(import.meta.dirname, "..", "..");
const URL_ADMIN = process.env.DATABASE_URL_PRUEBAS ?? "postgres://postgres:postgres@localhost:5432/postgres";

/** Crea una base vacía, carga el simulador de Supabase y aplica todas las migraciones en orden. */
export async function baseNueva(nombre: string): Promise<pg.Pool> {
  const admin = new pg.Client({ connectionString: URL_ADMIN });
  await admin.connect();
  await admin.query(`drop database if exists ${nombre} with (force)`);
  await admin.query(`create database ${nombre}`);
  await admin.end();

  const url = new URL(URL_ADMIN);
  url.pathname = `/${nombre}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 4 });

  await pool.query(readFileSync(join(RAIZ, "pruebas", "db", "simulador-supabase.sql"), "utf8"));
  const carpeta = join(RAIZ, "supabase", "migrations");
  for (const archivo of readdirSync(carpeta).filter((a) => a.endsWith(".sql")).sort()) {
    // Las extensiones de Supabase (pg_cron, pg_net) las reemplaza el simulador.
    const sql = readFileSync(join(carpeta, archivo), "utf8").replace(/^create extension .*$/gim, "");
    try {
      await pool.query(sql);
    } catch (error) {
      throw new Error(`Falló la migración ${archivo}: ${(error as Error).message}`);
    }
  }
  return pool;
}

/** Verifica que la consulta falle sin abortar la transacción en curso (usa un savepoint). */
export async function debeFallar(c: pg.PoolClient, sql: string, patron: RegExp, params: unknown[] = []): Promise<void> {
  await c.query("savepoint prueba");
  let error: Error | null = null;
  try {
    await c.query(sql, params);
  } catch (e) {
    error = e as Error;
  }
  await c.query("rollback to savepoint prueba");
  if (!error) throw new Error(`Se esperaba un error ${patron} y la consulta pasó: ${sql}`);
  if (!patron.test(error.message)) throw new Error(`Error distinto al esperado ${patron}: ${error.message}`);
}

/** Corre fn dentro de una transacción con el rol y el usuario indicados; siempre revierte. */
export async function como<T>(
  pool: pg.Pool,
  rol: "anon" | "authenticated" | "service_role",
  userId: string | null,
  fn: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${rol}`);
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
    return await fn(c);
  } finally {
    await c.query("rollback");
    c.release();
  }
}
