// Registro único (migración 20261023000100_registro_unico.sql) contra Postgres real.
// Reproduce la FORMA de los datos de producción (cifras inventadas, no son de Mena): 13 instrumentos en
// el Portafolio con las clases viejas (efectivo, ahorros, rentafija, accionesusa), 12 transacciones,
// 1 cierre con el uso de 2 tarjetas, parámetros con tarjetas y presupuesto, y en el Presupuesto 5
// cuentas (con tipo, saldo inicial y tarjetas con límite), categorías, fijos, movimientos y un cuadre.
// Se siembra ANTES de las migraciones de clases y presupuesto, y se aplican todas las que siguen.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { COLUMNAS, type FilasCaja, filasADatos, ORDEN } from "../../lib/caja/filas";
import { simular } from "../../lib/caja/motor";
import { COLUMNAS_REGISTRO, conSaldosVigentes, filaARegistro, sugerirUniones } from "../../lib/capital/registro";
import { como, debeFallar } from "./base";

const RAIZ = join(import.meta.dirname, "..", "..");
const URL_ADMIN = process.env.DATABASE_URL_PRUEBAS ?? "postgres://postgres:postgres@localhost:5432/postgres";
const PRIMERA_NUEVA = "20261017000100_capital_clases.sql";
const REGISTRO = "20261023000100_registro_unico.sql";
const MENA = "11111111-1111-1111-1111-111111111111";
const INTRUSO = "22222222-2222-2222-2222-222222222222";
const TABLAS_CAJA = ["caja_config", "caja_cuentas", "caja_categorias", "caja_recurrentes", "caja_movimientos", "caja_omitidos", "caja_saldos_reales", "caja_notas"] as const;

const migraciones = () => readdirSync(join(RAIZ, "supabase", "migrations")).filter((a) => a.endsWith(".sql")).sort();
const sql = (a: string) => readFileSync(join(RAIZ, "supabase", "migrations", a), "utf8").replace(/^create extension .*$/gim, "");

let pool: pg.Pool;
/** Lo que había justo antes de la migración del registro (para comparar). */
let antes: { parametros: unknown; cierres: unknown; transacciones: unknown; caja: FilasCaja; resultado: unknown; activos: Record<string, unknown>[] };

async function leerCaja(c: pg.PoolClient | pg.Pool): Promise<FilasCaja> {
  const filas: Record<string, unknown>[][] = [];
  for (const t of TABLAS_CAJA) {
    const orden = (ORDEN as Record<string, readonly string[]>)[t];
    filas.push((await c.query(`select ${COLUMNAS[t]} from personal.${t}${orden ? ` order by ${orden.join(", ")}` : ""}`)).rows);
  }
  const [config, cuentas, categorias, recurrentes, movimientos, omitidos, saldos, notas] = filas;
  return { config: config[0] ?? null, cuentas, categorias, recurrentes, movimientos, omitidos, saldos, notas };
}

async function registro(c: pg.PoolClient | pg.Pool) {
  const enl = (await c.query("select id, registro_id from personal.caja_cuentas")).rows as { id: string; registro_id: string }[];
  const filas = (await c.query(`select ${COLUMNAS_REGISTRO} from personal.activos order by orden, id`)).rows;
  return filas.map((f) => filaARegistro(f, enl.find((e) => e.registro_id === f.id)?.id ?? null));
}

beforeAll(async () => {
  const nombre = "strategya_pruebas_capital_registro";
  const admin = new pg.Client({ connectionString: URL_ADMIN });
  await admin.connect();
  await admin.query(`drop database if exists ${nombre} with (force)`);
  await admin.query(`create database ${nombre}`);
  await admin.end();
  const url = new URL(URL_ADMIN);
  url.pathname = `/${nombre}`;
  pool = new pg.Pool({ connectionString: url.toString(), max: 4 });
  await pool.query(readFileSync(join(RAIZ, "pruebas", "db", "simulador-supabase.sql"), "utf8"));
  for (const a of migraciones().filter((x) => x < PRIMERA_NUEVA)) await pool.query(sql(a));

  // Portafolio: 13 instrumentos con las clases viejas. «a1» choca a propósito con una cuenta del Presupuesto.
  await pool.query(`insert into personal.activos (id, clase, nombre, institucion, simbolo, moneda, cantidad, precio, tasa, vencimiento, tipo_rf, orden) values
    ('a1', 'efectivo', 'Efectivo en casa', '', null, 'DOP', '4500', 1, 0, null, null, 1),
    ('a2', 'efectivo', 'Dólares en efectivo', '', null, 'USD', '300', 1, 0, null, null, 2),
    ('a3', 'ahorros', 'Cuenta Popular', 'Banco Popular', null, 'DOP', '45000.50', 1, '0.005', null, null, 3),
    ('a4', 'ahorros', 'Ahorro APAP', 'APAP', null, 'DOP', '15000', 1, '0.04', null, null, 4),
    ('a5', 'ahorros', 'Cuenta en dólares', 'Banreservas', null, 'USD', '1200', 1, '0.01', null, null, 5),
    ('a6', 'ahorros', 'Ahorro BHD', 'BHD', null, 'DOP', '8000', 1, '0.03', null, null, 6),
    ('a7', 'rentafija', 'Certificado 1 año', 'Banco Popular', null, 'DOP', '100000', 1, '0.095', '2027-03-15', 'acumula', 7),
    ('a8', 'rentafija', 'Fondo abierto', 'SAFI X', null, 'DOP', '60000', 1, '0.085', null, 'acumula', 8),
    ('a9', 'rentafija', 'Bono Hacienda', 'Ministerio de Hacienda', null, 'DOP', '50000', 1, '0.11', '2030-06-01', 'cupon', 9),
    ('a10', 'rentafija', 'Puesto de bolsa', 'Puesto Y', null, 'USD', '2000', 1, '0.06', '2027-12-01', 'cupon', 10),
    ('a11', 'accionesusa', 'ETF S&P 500', 'Corredor', 'VOO', 'USD', '2', '500.25', '0.013', null, null, 11),
    ('a12', 'accionesusa', 'Acción A', 'Corredor', 'AAPL', 'USD', '3', '180', 0, null, null, 12),
    ('a13', 'accionesusa', 'Acción B', 'Corredor', 'MSFT', 'USD', '1', '400', 0, null, null, 13)`);
  const tx = Array.from({ length: 12 }, (_, i) => `('t${i + 1}', 'a${(i % 13) + 1}', '', 'compra', '2026-0${(i % 9) + 1}-10', 1, ${100 + i}, 0, 'DOP')`).join(", ");
  await pool.query(`insert into personal.transacciones (id, activo_id, simbolo, tipo, fecha, cantidad, precio, comision, moneda) values ${tx}`);
  await pool.query(`insert into personal.parametros (id, datos) values (1, $1::jsonb)`, [
    JSON.stringify({
      fx: { USD: "60.5", EUR: null },
      metaAsignacion: { efectivo: "0.05", ahorros: "0.15", rentafija: "0.5", accionesusa: "0.3" },
      escenarios: [{ id: "base", nom: "Base", retorno: "0.08", inflacion: "0.04", deprecFX: "0.03", aporte: "10000" }],
      tarjetas: [
        { id: "tc-1", nombre: "Visa Popular", limite: "80000" },
        { id: "tc-2", nombre: "Mastercard BHD", limite: "50000" },
      ],
      ingresos: [{ id: "in-1", nombre: "Sueldo", pres: "90000" }],
      fijos: [{ id: "gf-1", nombre: "Alquiler", pres: "22000" }],
      variables: [],
      aportes: [],
    }),
  ]);
  await pool.query(`insert into personal.cierres (mes, datos) values ('2026-09', $1::jsonb)`, [
    JSON.stringify({ ingresos: { "in-1": "90000" }, fijos: { "gf-1": "22000" }, tarjetas: { "tc-1": { uso: "12000", full: true }, "tc-2": { uso: "3000", full: true } }, deudas: { tc: "15000" }, cerrado: true }),
  ]);
  // Presupuesto con la forma de antes: 5 cuentas (una con el id «a1», igual que un instrumento).
  await pool.query(`
    insert into personal.caja_config (inicio, colchon, margen, tasa_usd) values ('2026-10-01', 10000, 3000, 60);
    insert into personal.caja_cuentas (id, nombre, tipo, saldo_inicial, limite, orden) values
      ('a1', 'Banco Popular', 'banco', 48250.75, null, 1), ('e', 'Cartera', 'efectivo', 3500, null, 2),
      ('h', 'Ahorro APAP', 'ahorro', 15000, null, 3), ('v', 'Visa Popular', 'tarjeta', 12400, 80000, 4),
      ('m', 'MasterCard', 'tarjeta', 2000, 50000, 5);
    insert into personal.caja_categorias (id, nombre, grupo, presupuesto) values
      ('k1', 'Sueldo', 'ingreso', null), ('k3', 'Alquiler', 'fijo', 22000), ('k6', 'Comida', 'variable', 12000),
      ('k9', 'Ahorro', 'ahorro', 5000), ('k11', 'Préstamo', 'deuda', 7500);
    insert into personal.caja_recurrentes (id, nombre, tipo, monto, cuenta, categoria, dias) values
      ('r1', 'Quincena', 'ingreso', 45000, 'a1', 'k1', '15, 30'),
      ('r2', 'Alquiler', 'gasto', 22000, 'a1', 'k3', '1');
    insert into personal.caja_movimientos (id, fecha, tipo, monto, cuenta, destino, categoria, nota, recurrente_id) values
      ('m1', '2026-10-01', 'gasto', 22000, 'a1', null, 'k3', null, 'r2'),
      ('m2', '2026-10-04', 'gasto', 1250.75, 'e', null, 'k6', 'Supermercado', null),
      ('m3', '2026-10-05', 'gasto', 3400, 'v', null, 'k6', 'Colmado', null),
      ('m4', '2026-10-06', 'transferencia', 5000, 'a1', 'h', 'k9', null, null),
      ('m5', '2026-10-08', 'pago_tarjeta', 2000, 'a1', 'v', null, null, null);
    insert into personal.caja_saldos_reales (fecha, cuenta_id, saldo) values ('2026-10-07', 'e', 2000);
  `);

  for (const a of migraciones().filter((x) => x >= PRIMERA_NUEVA && x < REGISTRO)) await pool.query(sql(a));
  antes = {
    parametros: (await pool.query("select datos from personal.parametros")).rows[0].datos,
    cierres: (await pool.query("select mes, datos from personal.cierres order by mes")).rows,
    transacciones: (await pool.query("select * from personal.transacciones order by id")).rows,
    caja: await leerCaja(pool),
    resultado: (await pool.query("select personal.resultado_mes('2026-10-15') as r")).rows[0].r,
    activos: (await pool.query("select id, clase, nombre, institucion, simbolo, moneda, cantidad::text, precio::text, tasa::text from personal.activos order by id")).rows,
  };
  for (const a of migraciones().filter((x) => x >= REGISTRO)) await pool.query(sql(a));

  await pool.query("insert into auth.users (id, email) values ($1, 'mena@ejemplo.do'), ($2, 'otro@ejemplo.do')", [MENA, INTRUSO]);
  await pool.query("insert into mercado.usuarios_autorizados (user_id) values ($1)", [MENA]);
});

afterAll(async () => {
  await pool?.end();
});

describe("migración: crea el registro único conservando TODO", () => {
  it("los 13 instrumentos quedan igual (con su clase de hoy) y vienen del Portafolio", async () => {
    const r = await pool.query(
      "select id, clase, nombre, institucion, simbolo, moneda, cantidad::text, precio::text, tasa::text, origen, unido_a from personal.activos where origen = 'portafolio' order by id",
    );
    expect(r.rows).toHaveLength(13);
    expect(r.rows.map(({ origen: _o, unido_a: _u, ...x }) => x)).toEqual(antes.activos);
    expect(r.rows.every((x) => x.origen === "portafolio" && x.unido_a === null)).toBe(true);
    expect(r.rows.filter((x) => x.clase === "rentavariable").map((x) => x.id)).toEqual(["a11", "a12", "a13"]);
  });

  it("cada cuenta del Presupuesto es una fila del registro, enlazada y con su saldo; el id que chocaba se cambió", async () => {
    const r = await pool.query(`
      select c.id as caja, c.tipo, a.id, a.clase, a.subtipo, a.nombre, a.cantidad::text, a.limite::text, a.saldo_fecha::text, a.origen
      from personal.caja_cuentas c join personal.activos a on a.id = c.registro_id order by c.orden`);
    expect(r.rows).toEqual([
      { caja: "a1", tipo: "banco", id: "a1-1", clase: "ahorros", subtipo: "corriente", nombre: "Banco Popular", cantidad: "48250.75", limite: null, saldo_fecha: "2026-10-01", origen: "presupuesto" },
      { caja: "e", tipo: "efectivo", id: "e", clase: "efectivo", subtipo: null, nombre: "Cartera", cantidad: "3500", limite: null, saldo_fecha: "2026-10-01", origen: "presupuesto" },
      { caja: "h", tipo: "ahorro", id: "h", clase: "ahorros", subtipo: "ahorro", nombre: "Ahorro APAP", cantidad: "15000", limite: null, saldo_fecha: "2026-10-01", origen: "presupuesto" },
      { caja: "v", tipo: "tarjeta", id: "v", clase: "tarjeta", subtipo: null, nombre: "Visa Popular", cantidad: "12400", limite: "80000", saldo_fecha: "2026-10-01", origen: "presupuesto" },
      { caja: "m", tipo: "tarjeta", id: "m", clase: "tarjeta", subtipo: null, nombre: "MasterCard", cantidad: "2000", limite: "50000", saldo_fecha: "2026-10-01", origen: "presupuesto" },
    ]);
    // El instrumento «a1» del Portafolio no se tocó.
    expect((await pool.query("select nombre, cantidad::text from personal.activos where id = 'a1'")).rows[0]).toEqual({ nombre: "Efectivo en casa", cantidad: "4500" });
  });

  it("las tarjetas de los parámetros son deudas del registro con su mismo id (sin saldo conocido) y los parámetros no cambian", async () => {
    const r = await pool.query("select id, clase, nombre, cantidad::text, limite::text, saldo_fecha, origen from personal.activos where origen = 'tarjetas' order by id");
    expect(r.rows).toEqual([
      { id: "tc-1", clase: "tarjeta", nombre: "Visa Popular", cantidad: "0", limite: "80000", saldo_fecha: null, origen: "tarjetas" },
      { id: "tc-2", clase: "tarjeta", nombre: "Mastercard BHD", cantidad: "0", limite: "50000", saldo_fecha: null, origen: "tarjetas" },
    ]);
    expect((await pool.query("select datos from personal.parametros")).rows[0].datos).toEqual(antes.parametros);
    expect((await pool.query("select mes, datos from personal.cierres order by mes")).rows).toEqual(antes.cierres);
    expect((await pool.query("select id, activo_id, simbolo, tipo, fecha, cantidad, precio, comision, moneda from personal.transacciones order by id")).rows).toEqual(
      (antes.transacciones as Record<string, unknown>[]).map(({ id, activo_id, simbolo, tipo, fecha, cantidad, precio, comision, moneda }) => ({ id, activo_id, simbolo, tipo, fecha, cantidad, precio, comision, moneda })),
    );
    expect((await pool.query("select count(*)::int n from personal.activos")).rows[0].n).toBe(13 + 5 + 2);
  });

  it("el Presupuesto da exactamente lo mismo: mismos datos, misma simulación, mismo estado de resultados", async () => {
    const despues = await leerCaja(pool);
    expect(filasADatos(despues)).toEqual(filasADatos(antes.caja));
    const a = simular(filasADatos(antes.caja), { hoy: "2026-10-20", hasta: "2026-11-30" });
    const b = simular(filasADatos(despues), { hoy: "2026-10-20", hasta: "2026-11-30" });
    expect(b.dias).toEqual(a.dias);
    expect((await pool.query("select personal.resultado_mes('2026-10-15') as r")).rows[0].r).toEqual(antes.resultado);
  });

  it("el saldo vigente de cada cuenta del Presupuesto = su saldo + lo anotado (incluido el cuadre)", async () => {
    const items = conSaldosVigentes(await registro(pool), filasADatos(await leerCaja(pool)), "2026-10-20");
    const v = Object.fromEntries(items.filter((i) => i.cajaId).map((i) => [i.cajaId, i.cantidad]));
    // Banco: 48,250.75 − 22,000 − 5,000 − 2,000 = 19,250.75 (la quincena del 15 no se confirmó: no cuenta).
    expect(v).toEqual({ a1: "19250.75", e: "2000", h: "20000", v: "13800", m: "2000" });
    expect(items.find((i) => i.cajaId === "v")!.vigente).toEqual({ fuente: "presupuesto", movimientos: 2 });
  });

  it("sugiere los pares repetidos sin unir nada", async () => {
    const pares = sugerirUniones(await registro(pool));
    expect(pares.map((p) => [p.presupuesto.id, p.portafolio.id, p.motivo])).toEqual([
      ["h", "a4", "Tienen el mismo nombre."],
      ["v", "tc-1", "Tienen el mismo nombre."],
      ["a1-1", "a3", "«Banco Popular» lleva el nombre de la institución de «Cuenta Popular» (Banco Popular)."],
      ["e", "a1", "Las dos son tu efectivo y no hay otro."],
      ["m", "tc-2", "Los dos nombres dicen «mastercard»."],
    ]);
    // Lo que Mena ya descartó no se vuelve a sugerir.
    expect(sugerirUniones(await registro(pool), new Set(["h|a4"])).some((p) => p.presupuesto.id === "h")).toBe(false);
    expect((await pool.query("select count(*)::int n from personal.activos where unido_a is not null")).rows[0].n).toBe(0);
  });
});

describe("una sola verdad: los triggers mantienen el Presupuesto y el registro iguales", () => {
  it("una cuenta nueva desde el Presupuesto se crea en el registro en el mismo paso", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await c.query("insert into personal.caja_cuentas (id, nombre, tipo, saldo_inicial) values ('n1', 'Préstamo carro', 'prestamo', 350000)");
      const r = await c.query("select a.id, a.clase, a.nombre, a.cantidad::text, a.origen from personal.caja_cuentas c join personal.activos a on a.id = c.registro_id where c.id = 'n1'");
      expect(r.rows).toEqual([{ id: "n1", clase: "prestamo", nombre: "Préstamo carro", cantidad: "350000", origen: "presupuesto" }]);
    });
  });

  it("cambiar el nombre en un lado lo cambia en el otro", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await c.query("update personal.activos set nombre = 'Visa Platinum' where id = 'v'");
      expect((await c.query("select nombre from personal.caja_cuentas where id = 'v'")).rows[0].nombre).toBe("Visa Platinum");
      await c.query("update personal.caja_cuentas set nombre = 'Efectivo del día', saldo_inicial = 3600 where id = 'e'");
      expect((await c.query("select nombre, cantidad::text, saldo_fecha::text from personal.activos where id = 'e'")).rows[0]).toEqual({ nombre: "Efectivo del día", cantidad: "3600", saldo_fecha: "2026-10-01" });
    });
  });

  it("escribir el saldo de hoy en el Portafolio lo anota en el Presupuesto como cuadre del día anterior", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await c.query("update personal.activos set cantidad = 21000, saldo_fecha = '2026-10-18' where id = 'a1-1'");
      expect((await c.query("select fecha::text, saldo::text from personal.caja_saldos_reales where cuenta_id = 'a1'")).rows).toEqual([{ fecha: "2026-10-17", saldo: "21000" }]);
      // Con el saldo en la fecha de inicio, cambia el saldo inicial (sin cuadre).
      await c.query("update personal.activos set cantidad = 3000, saldo_fecha = '2026-10-01' where id = 'h'");
      expect((await c.query("select saldo_inicial::text from personal.caja_cuentas where id = 'h'")).rows[0].saldo_inicial).toBe("3000");
    });
  });

  it("protege lo que el Presupuesto usa: no se borra, no cambia de moneda y solo se enlazan saldos en RD$ o US$", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await debeFallar(c, "delete from personal.activos where id = 'v'", /foreign key/);
      // Fase F: la moneda de una cuenta que usa el Presupuesto no cambia (habría que quitarla primero).
      await debeFallar(c, "update personal.activos set moneda = 'USD' where id = 'e'", /la usa el Presupuesto en DOP/);
      // Fase F: una cuenta en US$ sí se puede enlazar (con su moneda); una en € no.
      await c.query("savepoint usd");
      await c.query("insert into personal.caja_cuentas (id, nombre, tipo, registro_id) values ('x5', 'x', 'banco', 'a5')");
      expect((await c.query("select moneda from personal.caja_cuentas where id = 'x5'")).rows[0].moneda).toBe("USD");
      await c.query("rollback to savepoint usd");
      await c.query("insert into personal.activos (id, clase, nombre, moneda, cantidad) values ('eur', 'ahorros', 'Cuenta en euros', 'EUR', 10)");
      await debeFallar(c, "insert into personal.caja_cuentas (nombre, tipo, registro_id) values ('x', 'banco', 'eur')", /lleva sus cuentas en RD\$ o US\$/);
      await debeFallar(c, "insert into personal.caja_cuentas (nombre, tipo, registro_id) values ('x', 'ahorro', 'a11')", /no es una cuenta con saldo/);
      await debeFallar(c, "insert into personal.caja_cuentas (nombre, tipo) values ('X', 'cripto')", /caja_cuentas_tipo_check/);
    });
  });

  it("enlazar una cuenta que ya estaba en el Portafolio toma su nombre, tipo y saldo", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await c.query("insert into personal.caja_cuentas (id, nombre, tipo, saldo_inicial, registro_id) values ('x6', '?', 'ahorro', 8000, 'a6')");
      const r = await c.query("select nombre, tipo from personal.caja_cuentas where id = 'x6'");
      expect(r.rows[0]).toEqual({ nombre: "Ahorro BHD", tipo: "ahorro" });
      // El saldo de a6 se escribió después del inicio del Presupuesto: entra como cuadre del día anterior.
      const f = (await c.query("select saldo_fecha from personal.activos where id = 'a6'")).rows[0].saldo_fecha as Date;
      const cuadre = await c.query("select (fecha + 1)::date as f, saldo::text from personal.caja_saldos_reales where cuenta_id = 'x6'");
      expect(cuadre.rows).toEqual([{ f, saldo: "8000" }]);
      // a7 (Renta Fija, saldo en pesos) sí puede ser destino de ahorro en el Presupuesto.
      await c.query("update personal.caja_config set inicio = current_date + 30");
      await c.query("insert into personal.caja_cuentas (id, nombre, tipo, saldo_inicial, registro_id) values ('x7', '?', 'banco', 1, 'a7')");
      expect((await c.query("select tipo from personal.caja_cuentas where id = 'x7'")).rows[0].tipo).toBe("ahorro");
      expect((await c.query("select cantidad::text from personal.activos where id = 'a7'")).rows[0].cantidad).toBe("1");
    });
  });
});

describe("unir cuentas repetidas (lo confirma Mena)", () => {
  it("une la cuenta del Presupuesto con la del Portafolio: la del Portafolio queda, la otra se archiva sin borrarse", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      const r = await c.query("select personal.unir_registro('a3', 'a1-1', 19500.25, '2026-10-20') as r");
      expect(r.rows[0].r).toEqual({ queda: "a3", archivada: "a1-1", cuenta_presupuesto: "a1", movimientos_pasados: 0 });
      // El Presupuesto ahora usa la fila del Portafolio, con su nombre, y sigue siendo «banco».
      expect((await c.query("select registro_id, nombre, tipo from personal.caja_cuentas where id = 'a1'")).rows[0]).toEqual({ registro_id: "a3", nombre: "Cuenta Popular", tipo: "banco" });
      const a3 = (await c.query("select subtipo, institucion, cantidad::text, saldo_fecha::text, tasa::text from personal.activos where id = 'a3'")).rows[0];
      expect(a3).toEqual({ subtipo: "corriente", institucion: "Banco Popular", cantidad: "19500.25", saldo_fecha: "2026-10-20", tasa: "0.005" });
      // El saldo confirmado entra como cuadre del día anterior; los movimientos siguen en la misma cuenta.
      expect((await c.query("select saldo::text from personal.caja_saldos_reales where cuenta_id = 'a1' and fecha = '2026-10-19'")).rows[0].saldo).toBe("19500.25");
      expect((await c.query("select count(*)::int n from personal.caja_movimientos where cuenta = 'a1'")).rows[0].n).toBe(3);
      const archivada = (await c.query("select unido_a, nombre, cantidad::text from personal.activos where id = 'a1-1'")).rows[0];
      expect(archivada).toEqual({ unido_a: "a3", nombre: "Banco Popular", cantidad: "48250.75" });
    });
  });

  it("une una tarjeta sin cambiar el saldo del Presupuesto: la tarjeta de los parámetros conserva su id (el uso de los cierres sigue valiendo)", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      const cuadresAntes = (await c.query("select count(*)::int n from personal.caja_saldos_reales")).rows[0].n;
      await c.query("select personal.unir_registro('tc-1', 'v')");
      expect((await c.query("select registro_id, tipo, limite::text from personal.caja_cuentas where id = 'v'")).rows[0]).toEqual({ registro_id: "tc-1", tipo: "tarjeta", limite: "80000" });
      expect((await c.query("select cantidad::text, saldo_fecha::text from personal.activos where id = 'tc-1'")).rows[0]).toEqual({ cantidad: "12400", saldo_fecha: "2026-10-01" });
      expect((await c.query("select count(*)::int n from personal.caja_saldos_reales")).rows[0].n).toBe(cuadresAntes);
      const items = conSaldosVigentes(await registro(c), filasADatos(await leerCaja(c)), "2026-10-20");
      expect(items.find((i) => i.id === "tc-1")!.cantidad).toBe("13800");
    });
  });

  it("si las dos estaban en el Presupuesto, sus movimientos, fijos y cuadres pasan a la que queda", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await c.query("insert into personal.caja_cuentas (id, nombre, tipo, saldo_inicial, registro_id) values ('x4', '?', 'ahorro', 15000, 'a4')");
      await c.query("insert into personal.caja_movimientos (id, fecha, tipo, monto, cuenta, destino) values ('m9', '2026-10-09', 'transferencia', 100, 'a1', 'h')");
      const r = await c.query("select personal.unir_registro('a4', 'h') as r");
      expect(r.rows[0].r.cuenta_presupuesto).toBe("x4");
      expect((await c.query("select destino from personal.caja_movimientos where id in ('m4', 'm9') order by id")).rows).toEqual([{ destino: "x4" }, { destino: "x4" }]);
      expect((await c.query("select count(*)::int n from personal.caja_cuentas where id = 'h'")).rows[0].n).toBe(0);
      expect((await c.query("select unido_a from personal.activos where id = 'h'")).rows[0].unido_a).toBe("a4");
    });
  });

  it("no une cosas distintas ni deja a otro usuario unir", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await debeFallar(c, "select personal.unir_registro('a3', 'v')", /deuda/);
      await debeFallar(c, "select personal.unir_registro('a5', 'a3')", /USD/);
      await debeFallar(c, "select personal.unir_registro('a3', 'a3')", /distintas/);
    });
    await como(pool, "authenticated", INTRUSO, async (c) => {
      await debeFallar(c, "select personal.unir_registro('a3', 'a1-1')", /No autorizado/);
      expect((await c.query("select count(*)::int n from personal.activos")).rows[0].n).toBe(0);
    });
    await como(pool, "anon", null, async (c) => {
      await debeFallar(c, "select personal.unir_registro('a3', 'a1-1')", /permission denied/);
    });
  });
});

describe("las importaciones no borran lo que usa el otro módulo", () => {
  it("importar el Portafolio reemplaza sus instrumentos pero conserva cuentas del Presupuesto, deudas y su saldo", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await c.query("select personal.unir_registro('a3', 'a1-1', 19500.25, '2026-10-20')");
      await c.query("select personal.importar_capital($1::jsonb)", [
        JSON.stringify({ activos: [{ id: "a3", clase: "ahorros", nombre: "Cuenta Popular", moneda: "DOP", cantidad: "1", precio: "1", tasa: "0.01" }, { id: "z1", clase: "rentafija", nombre: "Nuevo", moneda: "DOP", cantidad: "5000" }] }),
      ]);
      const ids = (await c.query("select id from personal.activos where unido_a is null order by id")).rows.map((x) => x.id);
      expect(ids).toEqual(["a3", "e", "h", "m", "n1", "tc-1", "tc-2", "v", "z1"].filter((x) => x !== "n1"));
      // a3 la usa el Presupuesto: su saldo no se pisa con el del archivo (sí su tasa).
      expect((await c.query("select cantidad::text, tasa::text from personal.activos where id = 'a3'")).rows[0]).toEqual({ cantidad: "19500.25", tasa: "0.01" });
    });
  });

  it("importar el Presupuesto conserva el enlace de cada cuenta y nunca borra filas del registro", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await c.query("select personal.unir_registro('a3', 'a1-1')");
      const n0 = (await c.query("select count(*)::int n from personal.activos")).rows[0].n;
      const datos = {
        config: { inicio: "2026-10-01", colchon: "10000", margen: "3000", tasa_usd: "60" },
        cuentas: [{ id: "a1", nombre: "Banco", tipo: "banco", saldo_inicial: "48250.75", limite: null, orden: 1 }, { id: "z", nombre: "Nueva", tipo: "efectivo", saldo_inicial: "10", limite: null, orden: 2 }],
      };
      await c.query("select personal.caja_importar($1::jsonb)", [JSON.stringify(datos)]);
      await c.query("select personal.caja_importar($1::jsonb)", [JSON.stringify(datos)]);
      expect((await c.query("select id, registro_id, nombre from personal.caja_cuentas order by orden")).rows).toEqual([
        { id: "a1", registro_id: "a3", nombre: "Cuenta Popular" },
        { id: "z", registro_id: "z", nombre: "Nueva" },
      ]);
      expect((await c.query("select count(*)::int n from personal.activos")).rows[0].n).toBe(n0 + 1);
    });
  });
});

describe("RLS", () => {
  it("un usuario no autorizado no ve el registro ni el enlace", async () => {
    await como(pool, "authenticated", INTRUSO, async (c) => {
      expect((await c.query("select count(*)::int n from personal.activos")).rows[0].n).toBe(0);
      expect((await c.query("select count(*)::int n from personal.caja_cuentas")).rows[0].n).toBe(0);
      await debeFallar(c, "insert into personal.caja_cuentas (nombre, tipo) values ('x', 'banco')", /row-level security/);
    });
  });
});
