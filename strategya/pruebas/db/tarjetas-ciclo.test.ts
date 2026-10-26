// Tarjetas: ciclo y doble moneda (migración 20261028000100_tarjetas_ciclo.sql) contra Postgres real.
// Reproduce la FORMA de los datos de producción (cifras y nombres inventados, no son de Mena): dos tarjetas en
// RD$ (una enlazada al Presupuesto con su pago fijo y otra que vino de los parámetros, sin saldo), un préstamo,
// pagos y un cuadre. Se siembra ANTES de la migración nueva, se aplica, y se compara: nada se pierde.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { COLUMNAS, COLUMNAS_COMPLETAS, conRegistro, type FilaEnlace, type FilasCaja, filasADatos, ORDEN } from "../../lib/caja/filas";
import { aJsonSQL } from "../../lib/caja/importar";
import { simular } from "../../lib/caja/motor";
import { claveUSD } from "../../lib/caja/tipos";
import { COLUMNAS_REGISTRO, conSaldosVigentes, filaARegistro } from "../../lib/capital/registro";
import { como, debeFallar } from "./base";

const RAIZ = join(import.meta.dirname, "..", "..");
const URL_ADMIN = process.env.DATABASE_URL_PRUEBAS ?? "postgres://postgres:postgres@localhost:5432/postgres";
const NUEVA = "20261028000100_tarjetas_ciclo.sql";
const MENA = "11111111-1111-1111-1111-111111111111";
const INTRUSO = "22222222-2222-2222-2222-222222222222";
const TABLAS = ["caja_config", "caja_cuentas", "caja_categorias", "caja_recurrentes", "caja_movimientos", "caja_omitidos", "caja_saldos_reales", "caja_notas"] as const;
/** Columnas del registro que existían antes de esta migración. */
const REGISTRO_ANTES =
  "id, clase, subtipo, nombre, institucion, moneda, cantidad::text, precio::text, tasa::text, saldo_fecha::text, limite::text, dia_pago, cuota::text, origen, unido_a, orden";

const migraciones = () => readdirSync(join(RAIZ, "supabase", "migrations")).filter((a) => a.endsWith(".sql")).sort();
const sql = (a: string) => readFileSync(join(RAIZ, "supabase", "migrations", a), "utf8").replace(/^create extension .*$/gim, "");

let pool: pg.Pool;
let antes: { activos: unknown[]; caja: FilasCaja; sim: unknown };

async function leer(c: pg.PoolClient | pg.Pool, columnas: Record<string, string> = COLUMNAS): Promise<FilasCaja> {
  const f: Record<string, unknown>[][] = [];
  for (const t of TABLAS) {
    const orden = (ORDEN as Record<string, readonly string[]>)[t];
    f.push((await c.query(`select ${columnas[t]} from personal.${t}${orden ? ` order by ${orden.join(", ")}` : ""}`)).rows);
  }
  const [config, cuentas, categorias, recurrentes, movimientos, omitidos, saldos, notas] = f;
  return { config: config[0] ?? null, cuentas, categorias, recurrentes, movimientos, omitidos, saldos, notas };
}

/** El Presupuesto como lo lee la app después de la migración: columnas completas y lo que viene del registro. */
async function leerCompleto(c: pg.PoolClient | pg.Pool) {
  const datos = filasADatos(await leer(c, COLUMNAS_COMPLETAS));
  // Lo mismo que pide la app por PostgREST (COLUMNAS_ENLACE), con los numeric como texto.
  const enl = (
    await c.query(`select c.id, c.registro_id,
        case when a.id is null then null else jsonb_build_object('clase', a.clase, 'moneda', a.moneda, 'tasa', a.tasa::text, 'dia_corte', a.dia_corte,
          'dias_para_pagar', a.dias_para_pagar, 'dia_pago', a.dia_pago, 'limite_usd', a.limite_usd::text, 'saldo_usd', a.saldo_usd::text,
          'saldo_usd_fecha', a.saldo_usd_fecha::text) end as activos
      from personal.caja_cuentas c left join personal.activos a on a.id = c.registro_id order by c.orden`)
  ).rows as FilaEnlace[];
  const enlaces = conRegistro(datos, enl);
  return { datos, enlaces };
}

beforeAll(async () => {
  const nombre = "strategya_pruebas_tarjetas_ciclo";
  const admin = new pg.Client({ connectionString: URL_ADMIN });
  await admin.connect();
  await admin.query(`drop database if exists ${nombre} with (force)`);
  await admin.query(`create database ${nombre}`);
  await admin.end();
  const url = new URL(URL_ADMIN);
  url.pathname = `/${nombre}`;
  pool = new pg.Pool({ connectionString: url.toString(), max: 4 });
  await pool.query(readFileSync(join(RAIZ, "pruebas", "db", "simulador-supabase.sql"), "utf8"));
  for (const a of migraciones().filter((x) => x < NUEVA)) await pool.query(sql(a));
  await pool.query("insert into auth.users (id, email) values ($1, 'mena@ejemplo.do'), ($2, 'otro@ejemplo.do')", [MENA, INTRUSO]);
  await pool.query("insert into mercado.usuarios_autorizados (user_id) values ($1)", [MENA]);
  await pool.query(`insert into mercado.observaciones (serie_id, valor, fecha_dato, fuente_id) values ('USDDOP_VENTA', 61.00, '2026-10-09', 'bcrd'), ('USDDOP_VENTA', 62.00, '2026-10-14', 'bcrd')`);

  // Registro: dos tarjetas en RD$ (una con día de pago), un préstamo y el banco.
  await pool.query(`insert into personal.activos (id, clase, subtipo, nombre, institucion, moneda, cantidad, precio, tasa, saldo_fecha, limite, dia_pago, cuota, origen, orden) values
    ('r-banco', 'ahorros', 'corriente', 'Banco nómina', 'Banco X', 'DOP', '90000', 1, 0, '2026-10-01', null, null, null, 'portafolio', 1),
    ('tc-x', 'tarjeta', null, 'Visa Banco X', 'Banco X', 'DOP', '15000', 1, 0, '2026-10-01', '80000', 28, null, 'tarjetas', 2),
    ('tc-y', 'tarjeta', null, 'Visa Banco Y', 'Banco Y', 'DOP', '0', 1, 0, null, '50000', null, null, 'tarjetas', 3),
    ('pr-1', 'prestamo', null, 'Préstamo del carro', 'Banco X', 'DOP', '300000', 1, '0.12', '2026-10-01', null, 5, '9500', 'portafolio', 4)`);
  await pool.query("insert into personal.caja_config (id, inicio, colchon, margen) values (1, '2026-10-01', 5000, 3000)");
  await pool.query(`insert into personal.caja_cuentas (id, nombre, tipo, saldo_inicial, limite, orden, registro_id) values
    ('b', 'Banco nómina', 'banco', 90000, null, 1, 'r-banco'),
    ('vx', 'Visa Banco X', 'tarjeta', 15000, 80000, 2, 'tc-x'),
    ('pr', 'Préstamo del carro', 'prestamo', 300000, null, 3, 'pr-1')`);
  await pool.query(`insert into personal.caja_recurrentes (id, nombre, tipo, monto, pago_total, cuenta, destino, frecuencia, dias) values
    ('r-pago', 'Pagar la Visa', 'pago_tarjeta', 0, true, 'b', 'vx', 'mensual', '28'),
    ('r-dos', 'Abonos a la Visa', 'pago_tarjeta', 1000, false, 'b', 'vx', 'mensual', '15, 30'),
    ('r-cuota', 'Cuota del carro', 'pago_tarjeta', 9500, false, 'b', 'pr', 'mensual', '5')`);
  await pool.query(`insert into personal.caja_movimientos (id, fecha, tipo, monto, cuenta, destino, interes) values
    ('m1', '2026-10-05', 'pago_tarjeta', 9500, 'b', 'pr', 3000),
    ('m2', '2026-10-12', 'gasto', 2500, 'vx', null, null),
    ('m3', '2026-10-20', 'pago_tarjeta', 5000, 'b', 'vx', null)`);
  await pool.query("insert into personal.caja_saldos_reales (fecha, cuenta_id, saldo) values ('2026-10-15', 'vx', 17500)");

  const caja = await leer(pool);
  // La simulación de antes, como la leía la app antes de esta migración (con moneda e interés de la Fase F).
  const conFaseF = { ...COLUMNAS_COMPLETAS, caja_recurrentes: COLUMNAS.caja_recurrentes, caja_movimientos: `${COLUMNAS.caja_movimientos}, interes::text` };
  antes = {
    activos: (await pool.query(`select ${REGISTRO_ANTES} from personal.activos order by id`)).rows,
    caja,
    sim: simular(filasADatos(await leer(pool, conFaseF)), { hoy: "2026-10-26", hasta: "2026-12-31" }).dias.map((d) => d.posiciones),
  };
  await pool.query(sql(NUEVA));
  for (const a of migraciones().filter((x) => x > NUEVA)) await pool.query(sql(a));
});

afterAll(async () => {
  await pool?.end();
});

describe("migración: las tarjetas de antes quedan en RD$ sin perder nada", () => {
  it("el registro conserva todas sus columnas; las nuevas quedan vacías; el día de pago sigue (ahora «día en que quieres pagar»)", async () => {
    expect((await pool.query(`select ${REGISTRO_ANTES} from personal.activos order by id`)).rows).toEqual(antes.activos);
    const nuevas = (await pool.query("select id, dia_corte, dias_para_pagar, limite_usd, saldo_usd, saldo_usd_fecha, dia_pago from personal.activos order by id")).rows;
    for (const f of nuevas) expect(f).toMatchObject({ dia_corte: null, dias_para_pagar: null, limite_usd: null, saldo_usd: null, saldo_usd_fecha: null });
    expect(nuevas.find((f) => f.id === "tc-x")!.dia_pago).toBe(28);
    const coment = (await pool.query("select col_description('personal.activos'::regclass, (select attnum from pg_attribute where attrelid = 'personal.activos'::regclass and attname = 'dia_pago')) as c")).rows[0].c;
    expect(coment).toMatch(/día del mes en que quieres pagar/);
  });

  it("el Presupuesto queda igual: mismas filas, `parte` vacía y la misma simulación", async () => {
    expect(await leer(pool)).toEqual(antes.caja);
    expect((await pool.query("select count(*)::int as n from personal.caja_movimientos where parte is not null")).rows[0].n).toBe(0);
    expect((await pool.query("select count(*)::int as n from personal.caja_recurrentes where parte is not null")).rows[0].n).toBe(0);
    const { datos } = await leerCompleto(pool);
    expect(datos.cuentas.find((c) => c.id === "vx")).toMatchObject({ diaPago: 28 });
    expect(datos.cuentas.find((c) => c.id === "vx")!.usd).toBeUndefined();
    expect(datos.saldos.some((s) => s.sintetico)).toBe(false);
    expect(simular(datos, { hoy: "2026-10-26", hasta: "2026-12-31" }).dias.map((d) => d.posiciones)).toEqual(antes.sim);
  });

  it("las pruebas de esquema siguen: ninguna tabla nueva en personal y RLS en todas", async () => {
    const { rows } = await pool.query("select relname, relrowsecurity from pg_class where relnamespace = 'personal'::regnamespace and relkind = 'r' order by relname");
    expect(rows.map((r) => r.relname)).toEqual([
      "activos", "caja_categorias", "caja_config", "caja_cuentas", "caja_movimientos", "caja_notas", "caja_omitidos", "caja_recurrentes", "caja_saldos_reales",
      "cierres", "ips", "parametros", "preferencias", "transacciones", "watchlist",
    ]);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });
});

describe("ciclo y doble moneda en la base", () => {
  it("Mena escribe el ciclo y la parte en US$; el pago fijo de un solo día sigue al día elegido (el de «15, 30» no)", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await c.query("update personal.activos set dia_corte = 15, dias_para_pagar = 28, dia_pago = 30, limite_usd = 2000, saldo_usd = 450, saldo_usd_fecha = '2026-10-27' where id = 'tc-x'");
      const r = (await c.query("select id, dias from personal.caja_recurrentes order by id")).rows;
      expect(r).toEqual([
        { id: "r-cuota", dias: "5" },
        { id: "r-dos", dias: "15, 30" },
        { id: "r-pago", dias: "30" },
      ]);
      // El préstamo no se toca aunque cambie su día de pago.
      await c.query("update personal.activos set dia_pago = 7 where id = 'pr-1'");
      expect((await c.query("select dias from personal.caja_recurrentes where id = 'r-cuota'")).rows[0].dias).toBe("5");

      // La app lo lee: ciclo, parte en US$ (cuadre sintético del 26) y el saldo de hoy en las dos monedas.
      const { datos, enlaces } = await leerCompleto(c);
      const vx = datos.cuentas.find((x) => x.id === "vx")!;
      expect(vx).toMatchObject({ ciclo: { diaCorte: 15, diasParaPagar: 28, diaPago: 30 }, usd: { saldoInicial: "0", limite: "2000" } });
      expect(datos.saldos.filter((s) => s.sintetico)).toEqual([{ fecha: "2026-10-26", cuentaId: "vx#usd", saldo: "450", sintetico: true }]);
      const filas = (await c.query(`select ${COLUMNAS_REGISTRO} from personal.activos order by orden, id`)).rows;
      const porRegistro = new Map(Object.entries(enlaces).map(([cj, rg]) => [rg, cj]));
      const items = conSaldosVigentes(filas.map((f) => filaARegistro(f, porRegistro.get(String(f.id)) ?? null)), datos, "2026-10-26");
      expect(items.find((i) => i.id === "tc-x")).toMatchObject({ cantidad: "12500", saldoUsd: "450", limiteUsd: "2000", diaCorte: 15, diasParaPagar: 28, diaPago: 30, pagos: ["2026-10-20"] });

      // Un pago a la parte en US$ desde pesos, con el dólar del BCRD vigente en la fecha (el del viernes 23: 62).
      await c.query("insert into personal.caja_movimientos (id, fecha, tipo, monto, moneda, cuenta, destino, parte) values ('m4', '2026-10-27', 'pago_tarjeta', 6200, 'DOP', 'b', 'vx', 'USD')");
      const d2 = await leerCompleto(c);
      d2.datos.tasasUSD = { hoy: "2026-10-27", serie: [{ fecha: "2026-10-23", valor: "62.00", url: null }] };
      const x = simular(d2.datos, { hoy: "2026-10-27", hasta: "2026-10-27" }).porFecha.get("2026-10-27")!;
      expect(x.posiciones).toMatchObject({ vx: "-12500", [claveUSD("vx")]: "-350" });
    });
  });

  it("las restricciones protegen: ciclo solo en tarjetas, parte en US$ solo en tarjetas en RD$, rangos", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await debeFallar(c, "update personal.activos set dia_corte = 5, dias_para_pagar = 20 where id = 'pr-1'", /activos_ciclo_check/);
      await debeFallar(c, "update personal.activos set limite_usd = 100 where id = 'pr-1'", /activos_doble_moneda_check/);
      await debeFallar(c, "insert into personal.activos (id, clase, nombre, moneda, cantidad, limite_usd) values ('tc-usd', 'tarjeta', 'Tarjeta en dólares', 'USD', 0, 500)", /activos_doble_moneda_check/);
      await debeFallar(c, "update personal.activos set dia_corte = 32 where id = 'tc-y'", /dia_corte_check/);
      await debeFallar(c, "update personal.activos set dias_para_pagar = 61, dia_corte = 15 where id = 'tc-y'", /dias_para_pagar_check/);
      await debeFallar(c, "update personal.activos set limite_usd = -1 where id = 'tc-y'", /limite_usd_check/);
      await debeFallar(c, "update personal.caja_movimientos set parte = 'EUR' where id = 'm3'", /parte_check/);
    });
  });

  it("importar el Presupuesto conserva la parte de cada pago; la exportación no guarda el cuadre sintético", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await c.query("update personal.activos set limite_usd = 2000, saldo_usd = 450, saldo_usd_fecha = '2026-10-27' where id = 'tc-x'");
      await c.query("update personal.caja_movimientos set parte = 'DOP' where id = 'm3'");
      await c.query("update personal.caja_recurrentes set parte = 'USD' where id = 'r-pago'");
      const { datos } = await leerCompleto(c);
      const r = await c.query("select personal.caja_importar($1::jsonb) as r", [JSON.stringify(aJsonSQL({ ...datos, config: datos.config! }))]);
      expect(r.rows[0].r).toMatchObject({ cuentas: 3, movimientos: 3, saldos: 1 });
      expect((await c.query("select id, parte from personal.caja_movimientos order by id")).rows).toEqual([
        { id: "m1", parte: null },
        { id: "m2", parte: null },
        { id: "m3", parte: "DOP" },
      ]);
      expect((await c.query("select parte from personal.caja_recurrentes where id = 'r-pago'")).rows[0].parte).toBe("USD");
      expect((await c.query("select cuenta_id from personal.caja_saldos_reales")).rows).toEqual([{ cuenta_id: "vx" }]);
      // El enlace con el registro se conserva (el ciclo y la parte en US$ viven allá).
      expect((await c.query("select registro_id from personal.caja_cuentas where id = 'vx'")).rows[0].registro_id).toBe("tc-x");
    });
  });

  it("unir dos filas repetidas conserva el ciclo, la parte en US$ y sus cuadres", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      // Una tarjeta repetida que vino del Presupuesto, con el ciclo anotado allá.
      await c.query("insert into personal.caja_cuentas (id, nombre, tipo, saldo_inicial, orden) values ('vy', 'Visa Y', 'tarjeta', 4000, 4)");
      const reg = (await c.query("select registro_id from personal.caja_cuentas where id = 'vy'")).rows[0].registro_id as string;
      await c.query("update personal.activos set dia_corte = 20, dias_para_pagar = 25, dia_pago = 10, limite_usd = 1000, saldo_usd = 80, saldo_usd_fecha = '2026-10-10' where id = $1", [reg]);
      await c.query("insert into personal.caja_saldos_reales (fecha, cuenta_id, saldo) values ('2026-10-18', 'vy#usd', 75)");
      await c.query("select personal.unir_registro('tc-y', $1)", [reg]);
      expect((await c.query("select dia_corte, dias_para_pagar, dia_pago, limite_usd::text, saldo_usd::text from personal.activos where id = 'tc-y'")).rows[0]).toEqual({
        dia_corte: 20, dias_para_pagar: 25, dia_pago: 10, limite_usd: "1000", saldo_usd: "80",
      });
      expect((await c.query("select id from personal.caja_cuentas where registro_id = 'tc-y'")).rows).toEqual([{ id: "vy" }]);
      expect((await c.query("select cuenta_id from personal.caja_saldos_reales where cuenta_id like 'vy%'")).rows).toEqual([{ cuenta_id: "vy#usd" }]);
      expect((await c.query("select unido_a from personal.activos where id = $1", [reg])).rows[0].unido_a).toBe("tc-y");
    });
  });

  it("RLS: un usuario no autorizado no ve ni cambia el ciclo; anon no tiene permiso", async () => {
    await como(pool, "authenticated", INTRUSO, async (c) => {
      expect((await c.query("select count(*)::int as n from personal.activos where dia_pago is not null")).rows[0].n).toBe(0);
      const u = await c.query("update personal.activos set dia_corte = 1, dias_para_pagar = 1 where id = 'tc-x'");
      expect(u.rowCount).toBe(0);
    });
    await como(pool, "anon", null, async (c) => {
      await debeFallar(c, "select dia_corte from personal.activos", /permission denied/);
    });
  });
});
