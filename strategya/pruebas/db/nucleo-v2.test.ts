// Núcleo financiero v2 (migración 20261029000100_nucleo_v2.sql) contra Postgres real.
//
// 1. MIGRACIÓN SIN PÉRDIDA con la FORMA de los datos de producción (nombres y cifras inventados, no son de Mena):
//    19 filas del registro: 7 cuentas de ahorro del Portafolio (una en US$), 2 efectivos (uno llamado «EUROS» pero en
//    RD$, otro del Presupuesto), 2 de renta fija (un mutuo y un bono), 5 de renta variable en US$ y RD$, 2 tarjetas del
//    Presupuesto y 2 filas unidas (archivadas con unido_a); 5 cuentas del Presupuesto enlazadas y 2 movimientos.
//    Se siembra ANTES de la migración, se aplica y se compara: nada se borra ni cambia; lo que paga o recibe queda en el
//    Presupuesto solo.
// 2. La base aplica EXACTAMENTE las reglas del módulo (lib/finanzas/catalogo.ts): tabla de verdad, tipo inicial y la
//    validación de cada movimiento, combinación por combinación. Y el estado de resultados (cargos, ahorro a
//    inversiones fuera del Presupuesto) da lo mismo en SQL que en la pantalla.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Big from "big.js";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { COLUMNAS_COMPLETAS, COLUMNAS_TARJETAS, type FilasCaja, filasADatos, ORDEN } from "../../lib/caja/filas";
import { aJsonSQL } from "../../lib/caja/importar";
import { simular } from "../../lib/caja/motor";
import { estadoDeResultados } from "../../lib/caja/resultados";
import { COLUMNAS_REGISTRO, COLUMNAS_REGISTRO_TARJETAS, conSaldosVigentes, filaARegistro } from "../../lib/capital/registro";
import { errorDeCuentas, FORMULARIOS, type FilaNombrada, ROLES, TIPOS_FIN, type TipoFin, tipoInicial } from "../../lib/finanzas/catalogo";
import { baseNueva, como, debeFallar } from "./base";

const RAIZ = join(import.meta.dirname, "..", "..");
const URL_ADMIN = process.env.DATABASE_URL_PRUEBAS ?? "postgres://postgres:postgres@localhost:5432/postgres";
const NUEVA = "20261029000100_nucleo_v2.sql";
const MENA = "11111111-1111-1111-1111-111111111111";
const INTRUSO = "22222222-2222-2222-2222-222222222222";
const TABLAS = ["caja_config", "caja_cuentas", "caja_categorias", "caja_recurrentes", "caja_movimientos", "caja_omitidos", "caja_saldos_reales", "caja_notas"] as const;

const migraciones = () => readdirSync(join(RAIZ, "supabase", "migrations")).filter((a) => a.endsWith(".sql")).sort();
const sql = (a: string) => readFileSync(join(RAIZ, "supabase", "migrations", a), "utf8").replace(/^create extension .*$/gim, "");

async function leer(c: pg.PoolClient | pg.Pool, columnas: Record<string, string>): Promise<FilasCaja> {
  const f: Record<string, unknown>[][] = [];
  for (const t of TABLAS) {
    const orden = (ORDEN as Record<string, readonly string[]>)[t];
    f.push((await c.query(`select ${columnas[t]} from personal.${t}${orden ? ` order by ${orden.join(", ")}` : ""}`)).rows);
  }
  const [config, cuentas, categorias, recurrentes, movimientos, omitidos, saldos, notas] = f;
  return { config: config[0] ?? null, cuentas, categorias, recurrentes, movimientos, omitidos, saldos, notas };
}

let pool: pg.Pool;
let reglas: pg.Pool;
let antes: { activos: Record<string, unknown>[]; caja: FilasCaja; sim: unknown; resultado: unknown };

beforeAll(async () => {
  const nombre = "strategya_pruebas_nucleo_v2_migracion";
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
  await pool.query("insert into mercado.observaciones (serie_id, valor, fecha_dato, fuente_id) values ('USDDOP_VENTA', 62.00, '2026-10-14', 'bcrd')");

  // ── La forma de producción (antes del Núcleo v2) ──
  await pool.query(`insert into personal.activos (id, clase, subtipo, nombre, institucion, simbolo, moneda, cantidad, precio, tasa, vencimiento, tipo_rf, saldo_fecha, limite, origen, orden) values
    ('ah-1', 'ahorros', null, 'Ahorro Banco A', 'Banco A', null, 'DOP', '150000.50', 1, 0.02, null, null, '2026-10-01', null, 'portafolio', 1),
    ('ah-2', 'ahorros', null, 'Ahorro Banco B', 'Banco B', null, 'DOP', '80000', 1, 0.01, null, null, '2026-10-01', null, 'portafolio', 2),
    ('ah-3', 'ahorros', null, 'Cuenta Alto Rendimiento C', 'Banco C', null, 'DOP', '45000', 1, 0.065, null, null, '2026-10-01', null, 'portafolio', 3),
    ('ah-4', 'ahorros', null, 'Ahorro D', 'Banco D', null, 'DOP', '12000', 1, 0, null, null, '2026-10-01', null, 'portafolio', 4),
    ('ah-5', 'ahorros', null, 'Ahorro E', 'Banco E', null, 'DOP', '9000', 1, 0, null, null, '2026-10-20', null, 'portafolio', 5),
    ('ah-6', 'ahorros', null, 'Nómina F', 'Banco F', null, 'DOP', '30000', 1, 0, null, null, '2026-10-01', null, 'portafolio', 6),
    ('ah-usd', 'ahorros', null, 'Ahorro en dólares', 'Banco A', null, 'USD', '2500', 1, 0.01, null, null, '2026-10-01', null, 'portafolio', 7),
    ('ef-eur', 'efectivo', null, 'EUROS', '', null, 'DOP', '18000', 1, 0, null, null, '2026-10-01', null, 'portafolio', 8),
    ('rf-mutuo', 'rentafija', null, 'Mutuo Puesto X', 'Puesto X', null, 'DOP', '200000', 1, 0.09, '2026-11-15', 'acumula', '2026-10-01', null, 'portafolio', 9),
    ('rf-bono', 'rentafija', null, 'Bono Hacienda 2030', 'Hacienda', null, 'DOP', '100000', 1, 0.11, '2030-02-01', 'cupon', '2026-10-01', null, 'portafolio', 10),
    ('rv-1', 'rentavariable', null, 'VOO', 'Corredor', 'VOO', 'USD', '3', 500, 0.013, null, null, '2026-10-01', null, 'portafolio', 11),
    ('rv-2', 'rentavariable', null, 'QQQ', 'Corredor', 'QQQ', 'USD', '2', 450, 0, null, null, '2026-10-01', null, 'portafolio', 12),
    ('rv-3', 'rentavariable', null, 'SCHD', 'Corredor', 'SCHD', 'USD', '10', 27, 0.035, null, null, '2026-10-01', null, 'portafolio', 13),
    ('rv-4', 'rentavariable', null, 'Fondo Abierto Renta Variable', 'SAFI Y', null, 'DOP', '500', 120.5, 0, null, null, '2026-10-01', null, 'portafolio', 14),
    ('rv-5', 'rentavariable', null, 'Acciones locales', 'Puesto X', null, 'DOP', '100', 85, 0, null, null, '2026-10-01', null, 'portafolio', 15),
    ('pr-efe', 'efectivo', null, 'Efectivo', '', null, 'DOP', '18000', 1, 0, null, null, '2026-10-01', null, 'presupuesto', 1001),
    ('pr-tc1', 'tarjeta', null, 'Visa A', '', null, 'DOP', '22000', 1, 0, null, null, '2026-10-01', '100000', 'presupuesto', 1002),
    ('pr-tc2', 'tarjeta', null, 'Mastercard B', '', null, 'DOP', '5000', 1, 0, null, null, '2026-10-01', '60000', 'presupuesto', 1003),
    ('pr-ah1', 'ahorros', 'ahorro', 'Banco A', '', null, 'DOP', '150000.50', 1, 0, null, null, '2026-10-01', null, 'presupuesto', 1004)`);
  await pool.query("insert into personal.caja_config (id, inicio, colchon, margen) values (1, '2026-10-01', 5000, 3000)");
  // Las 5 cuentas del Presupuesto enlazadas: efectivo y Banco A (después unidas con las del Portafolio), las dos
  // tarjetas y la nómina del Portafolio que se usó con «Usar en el Presupuesto».
  await pool.query(`insert into personal.caja_cuentas (id, nombre, tipo, saldo_inicial, limite, orden, registro_id) values
    ('c-efe', 'Efectivo', 'efectivo', 18000, null, 1, 'pr-efe'),
    ('c-tc1', 'Visa A', 'tarjeta', 22000, 100000, 2, 'pr-tc1'),
    ('c-tc2', 'Mastercard B', 'tarjeta', 5000, 60000, 3, 'pr-tc2'),
    ('c-ah1', 'Banco A', 'ahorro', 150000.50, null, 4, 'pr-ah1')`);
  await pool.query("update personal.activos set subtipo = 'corriente' where id = 'ah-6'");
  await pool.query("insert into personal.caja_cuentas (id, nombre, tipo, saldo_inicial, orden, registro_id) values ('c-ah6', '?', 'banco', 30000, 5, 'ah-6')");
  // Mena ya había unido dos pares repetidos (como en producción): la del Portafolio quedó, la otra archivada.
  const yo = await pool.connect();
  await yo.query("set role authenticated");
  await yo.query("select set_config('request.jwt.claim.sub', $1, false)", [MENA]);
  await yo.query("select personal.unir_registro('ah-1', 'pr-ah1')");
  await yo.query("select personal.unir_registro('ef-eur', 'pr-efe')");
  await yo.query("reset role");
  yo.release();
  await pool.query(`insert into personal.caja_categorias (id, nombre, tipo, adicional) values ('k-comida', 'Comida', 'gasto', 15000), ('k-sueldo', 'Sueldo', 'ingreso', null), ('k-ahorro', 'Ahorro', 'ahorro_inversion', 10000)`);
  await pool.query(`insert into personal.caja_movimientos (id, fecha, tipo, monto, cuenta, destino, categoria) values
    ('m1', '2026-10-05', 'gasto', 2500, 'c-tc1', null, 'k-comida'),
    ('m2', '2026-10-15', 'ingreso', 60000, 'c-ah6', null, 'k-sueldo')`);

  antes = {
    activos: (await pool.query(`select ${COLUMNAS_REGISTRO_TARJETAS} from personal.activos order by id`)).rows,
    caja: await leer(pool, COLUMNAS_TARJETAS),
    sim: simular(filasADatos(await leer(pool, COLUMNAS_TARJETAS)), { hoy: "2026-10-26", hasta: "2026-12-31" }).dias.map((d) => d.posiciones),
    resultado: (await pool.query("select personal.resultado_mes('2026-10-15') as r")).rows[0].r,
  };
  await pool.query(sql(NUEVA));
  for (const a of migraciones().filter((x) => x > NUEVA)) await pool.query(sql(a));

  reglas = await baseNueva("strategya_pruebas_nucleo_v2_reglas");
  await reglas.query("insert into auth.users (id, email) values ($1, 'mena@ejemplo.do'), ($2, 'otro@ejemplo.do')", [MENA, INTRUSO]);
  await reglas.query("insert into mercado.usuarios_autorizados (user_id) values ($1)", [MENA]);
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await reglas?.end();
});

describe("1 · migración sin pérdida (forma de producción)", () => {
  it("las 19 filas del registro siguen ahí con todos sus datos; nada se borró ni cambió", async () => {
    const despues = (await pool.query(`select ${COLUMNAS_REGISTRO_TARJETAS} from personal.activos order by id`)).rows;
    expect(despues).toHaveLength(19);
    // Solo el subtipo de la de alto rendimiento por nombre pasa a «alto_rendimiento» (el Presupuesto la trata igual).
    const sinSubtipo = (xs: Record<string, unknown>[]) => xs.map(({ subtipo: _s, actualizado_en: _a, ...r }) => r);
    expect(sinSubtipo(despues)).toEqual(sinSubtipo(antes.activos));
    expect(despues.filter((x) => x.unido_a).map((x) => x.id).sort()).toEqual(["pr-ah1", "pr-efe"]);
  });

  it("cada fila recibe su tipo; lo dudoso queda por confirmar (no se adivina de más)", async () => {
    const t = Object.fromEntries((await pool.query("select id, tipo, tipo_confirmado from personal.activos")).rows.map((r) => [r.id, [r.tipo, r.tipo_confirmado]]));
    expect(t).toMatchObject({
      "ah-1": ["ahorro", true], // al unirla tomó el subtipo «ahorro» de la del Presupuesto
      "ah-2": ["ahorro", false],
      "ah-3": ["alto_rendimiento", false],
      "ah-usd": ["ahorro", false],
      "ef-eur": ["efectivo", true],
      "rf-mutuo": ["mutuo", false],
      "rf-bono": ["bono", false],
      "rv-1": ["accion_etf", true],
      "rv-4": ["fondo_abierto", false],
      "rv-5": ["accion_etf", false],
      "pr-efe": ["efectivo", true],
      "pr-tc1": ["tarjeta", true],
      "ah-6": ["corriente", true],
    });
    // La misma regla que la pantalla (lib/finanzas/catalogo.ts · tipoInicial).
    for (const f of antes.activos) {
      const ti = tipoInicial({ clase: String(f.clase), subtipo: (f.subtipo as string | null) ?? null, nombre: String(f.nombre), institucion: String(f.institucion), simbolo: (f.simbolo as string | null) ?? null });
      expect([f.id, t[String(f.id)][0]]).toEqual([f.id, ti.tipo]);
    }
  });

  it("todo lo que paga o recibe quedó en el Presupuesto SOLO; acciones y fondos por cuotas no (son destinos de ahorro)", async () => {
    const enl = (await pool.query("select c.id, c.registro_id, c.tipo, c.moneda, c.saldo_inicial::text from personal.caja_cuentas c order by c.orden")).rows;
    expect(enl.slice(0, 5).map((x) => x.id)).toEqual(["c-efe", "c-tc1", "c-tc2", "c-ah1", "c-ah6"]);
    expect(enl.slice(0, 5).map((x) => x.registro_id)).toEqual(["ef-eur", "pr-tc1", "pr-tc2", "ah-1", "ah-6"]);
    expect(enl.slice(5).map((x) => [x.registro_id, x.tipo, x.moneda])).toEqual([
      ["ah-2", "ahorro", "DOP"],
      ["ah-3", "ahorro", "DOP"],
      ["ah-4", "ahorro", "DOP"],
      ["ah-5", "ahorro", "DOP"],
      ["ah-usd", "ahorro", "USD"],
      ["rf-mutuo", "ahorro", "DOP"],
      ["rf-bono", "ahorro", "DOP"],
    ]);
    expect(enl).toHaveLength(12);
    expect(enl.some((x) => String(x.registro_id).startsWith("rv-"))).toBe(false);
    // Volver a enlazar no agrega nada.
    expect((await pool.query("select personal.enlazar_registro() as n")).rows[0].n).toBe(0);
  });

  it("el Presupuesto de antes da lo mismo: mismas cuentas, movimientos, simulación y estado de resultados", async () => {
    const despues = await leer(pool, COLUMNAS_TARJETAS);
    expect(despues.movimientos).toEqual(antes.caja.movimientos);
    expect(despues.categorias).toEqual(antes.caja.categorias);
    expect(despues.cuentas.slice(0, 5)).toEqual(antes.caja.cuentas);
    const sim = simular(filasADatos(despues), { hoy: "2026-10-26", hasta: "2026-12-31" }).dias.map((d) =>
      Object.fromEntries(Object.entries(d.posiciones).filter(([k]) => antes.caja.cuentas.some((c) => c.id === k))),
    );
    expect(sim).toEqual(antes.sim);
    const r = (await pool.query("select personal.resultado_mes('2026-10-15') as r")).rows[0].r;
    expect(r).toEqual(antes.resultado);
  });

  it("el saldo de hoy de cada fila recién enlazada es el que estaba escrito (el de después del inicio, como cuadre)", async () => {
    const datos = filasADatos(await leer(pool, COLUMNAS_COMPLETAS));
    const enl = (await pool.query("select id, registro_id from personal.caja_cuentas")).rows as { id: string; registro_id: string }[];
    const filas = (await pool.query(`select ${COLUMNAS_REGISTRO} from personal.activos where unido_a is null order by orden, id`)).rows;
    const reg = conSaldosVigentes(filas.map((x) => filaARegistro(x, enl.find((e) => e.registro_id === x.id)?.id ?? null)), datos, "2026-10-26");
    const v = Object.fromEntries(reg.map((i) => [i.id, i.cantidad]));
    expect(v).toMatchObject({ "ah-2": "80000", "ah-3": "45000", "ah-5": "9000", "ah-usd": "2500", "rf-mutuo": "200000", "rf-bono": "100000" });
    expect((await pool.query("select fecha::text, saldo::text from personal.caja_saldos_reales where cuenta_id = (select id from personal.caja_cuentas where registro_id = 'ah-5')")).rows).toEqual([
      { fecha: "2026-10-19", saldo: "9000" },
    ]);
  });

  it("importar el Presupuesto (con sus filas viejas) lo restaura tal cual y vuelve a enlazar lo que falte", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      const f = await leer(c, COLUMNAS_COMPLETAS);
      const datos = filasADatos(f);
      const enl = (await c.query("select id, registro_id from personal.caja_cuentas")).rows as { id: string; registro_id: string }[];
      const json = aJsonSQL({ ...datos, config: datos.config!, cuentas: datos.cuentas.slice(0, 5).map((x) => ({ ...x, registroId: enl.find((e) => e.id === x.id)?.registro_id })) });
      const r = (await c.query("select personal.caja_importar($1::jsonb) as r", [JSON.stringify(json)])).rows[0].r;
      expect(r.cuentas).toBe(12);
      expect(r.movimientos).toBe(2);
    });
  });
});

/** Una fila de cada tipo (y el alto rendimiento con débito), enlazadas solas al Presupuesto si pagan o reciben. */
async function sembrarTipos(c: pg.PoolClient): Promise<Record<string, FilaNombrada & { caja: string | null; id: string }>> {
  await c.query("insert into personal.caja_config (inicio, colchon, margen) values ('2026-10-01', 0, 0)");
  const filas: Record<string, FilaNombrada & { caja: string | null; id: string }> = {};
  for (const t of [...TIPOS_FIN, "alto_debito"]) {
    const tipo = (t === "alto_debito" ? "alto_rendimiento" : t) as TipoFin;
    const clase = { efectivo: "efectivo", corriente: "ahorros", ahorro: "ahorros", alto_rendimiento: "ahorros", certificado: "rentafija", mutuo: "rentafija", bono: "rentafija", fondo_abierto: "rentafija", fondo_cerrado: "rentafija", accion_etf: "rentavariable", fideicomiso: "rentafija", tarjeta: "tarjeta", prestamo: "prestamo", otra_deuda: "deuda", bien: "otros" }[tipo];
    const precio = tipo === "accion_etf" || tipo === "bien" ? 10 : 1;
    await c.query("insert into personal.activos (id, clase, nombre, moneda, cantidad, precio, tipo, tiene_debito, saldo_fecha) values ($1, $2, $3, 'DOP', 1000000, $4, $5, $6, '2026-10-01')", [
      `t-${t}`, clase, `T ${t}`, precio, tipo, t === "alto_debito" ? true : null,
    ]);
    const caja = (await c.query("select id from personal.caja_cuentas where registro_id = $1", [`t-${t}`])).rows[0]?.id ?? null;
    filas[t] = { tipo, debito: t === "alto_debito", nombre: `T ${t}`, caja, id: `t-${t}` };
  }
  return filas;
}

describe("2 · la base aplica las mismas reglas del módulo", () => {
  it("tabla de verdad: personal.tipo_aparece = catalogo.aparece en TODAS las combinaciones", async () => {
    const { aparece } = await import("../../lib/finanzas/catalogo");
    const casos: [string, boolean, string, string][] = [];
    for (const t of TIPOS_FIN) for (const d of [false, true]) for (const f of FORMULARIOS) for (const r of ["cuenta", "origen", "destino"]) casos.push([t, d, f, r]);
    const { rows } = await reglas.query(
      "select x.t, x.d, x.f, x.r, personal.tipo_aparece(x.t, x.d, x.f, x.r) as si from jsonb_to_recordset($1::jsonb) as x (t text, d boolean, f text, r text)",
      [JSON.stringify(casos.map(([t, d, f, r]) => ({ t, d, f, r })))],
    );
    expect(rows).toHaveLength(casos.length);
    for (const x of rows) {
      const ts = (ROLES[x.f as (typeof FORMULARIOS)[number]] as readonly string[]).includes(x.r) && aparece({ tipo: x.t, debito: x.d }, x.f, x.r);
      expect([x.t, x.d, x.f, x.r, x.si]).toEqual([x.t, x.d, x.f, x.r, ts]);
    }
  });

  it("cada movimiento: la base acepta o rechaza EXACTAMENTE lo que dice errorDeCuentas (todas las combinaciones)", async () => {
    await como(reglas, "authenticated", MENA, async (c) => {
      const filas = await sembrarTipos(c);
      const lista = Object.values(filas);
      let n = 0;
      const probar = async (tipo: string, o: (typeof lista)[number], d: (typeof lista)[number] | null) => {
        const reg = tipo === "transferencia";
        if ((!o.caja && !reg) || (d && !d.caja && !reg) || (d && o.id === d.id)) return;
        const cols = {
          cuenta: o.caja,
          registro_origen: o.caja ? null : o.id,
          destino: d?.caja ?? null,
          registro_destino: d && !d.caja ? d.id : null,
        };
        await c.query("savepoint v");
        let paso = true;
        let msg = "";
        try {
          await c.query("insert into personal.caja_movimientos (fecha, tipo, monto, cuenta, destino, registro_origen, registro_destino) values ('2026-10-10', $1, 10, $2, $3, $4, $5)", [
            tipo, cols.cuenta, cols.destino, cols.registro_origen, cols.registro_destino,
          ]);
        } catch (e) {
          paso = false;
          msg = (e as Error).message;
        }
        await c.query("rollback to savepoint v");
        const ts = errorDeCuentas(tipo, o, d);
        expect([tipo, o.id, d?.id ?? null, paso]).toEqual([tipo, o.id, d?.id ?? null, ts === null]);
        if (ts) expect(msg).toBe(ts);
        n++;
      };
      for (const o of lista) {
        await probar("gasto", o, null);
        await probar("ingreso", o, null);
        for (const d of lista) {
          await probar("pago_tarjeta", o, d);
          await probar("transferencia", o, d);
        }
      }
      expect(n).toBeGreaterThan(400);
    });
  });

  it("UNA INVERSIÓN NUNCA SE USA PARA PAGAR: la base lo rechaza con el mensaje del manual", async () => {
    await como(reglas, "authenticated", MENA, async (c) => {
      const f = await sembrarTipos(c);
      await debeFallar(c, "insert into personal.caja_movimientos (fecha, tipo, monto, cuenta) values ('2026-10-10', 'gasto', 100, $1)", /nunca se usa para pagar.*Rescate o venta/, [f.certificado.caja]);
      await debeFallar(c, "insert into personal.caja_recurrentes (nombre, tipo, monto, cuenta, dias) values ('x', 'gasto', 100, $1, '5')", /nunca se usa para pagar/, [f.mutuo.caja]);
    });
  });

  it("la importación restaura la historia tal cual (sin validar) y asignar una categoría a algo viejo siempre se puede", async () => {
    await como(reglas, "authenticated", MENA, async (c) => {
      const f = await sembrarTipos(c);
      const caja = filasADatos(await leer(c, COLUMNAS_COMPLETAS));
      caja.movimientos = [{ id: "viejo", fecha: "2026-10-03", tipo: "gasto", monto: "50", moneda: "DOP", tasa: null, cuenta: f.certificado.caja, destino: null, categoria: null, nota: null, recurrenteId: null }];
      await c.query("select personal.caja_importar($1::jsonb)", [JSON.stringify(aJsonSQL({ ...caja, config: caja.config! }))]);
      expect((await c.query("select count(*)::int as n from personal.caja_movimientos where id = 'viejo'")).rows[0].n).toBe(1);
      await c.query("insert into personal.caja_categorias (id, nombre, tipo) values ('k', 'Otros', 'gasto')");
      await c.query("update personal.caja_movimientos set categoria = 'k' where id = 'viejo'");
      // Pero cambiar su cuenta sí se revisa (ya no es «restaurar»).
      await debeFallar(c, "update personal.caja_movimientos set cuenta = $1 where id = 'viejo'", /nunca se usa para pagar/, [f.mutuo.caja]);
    });
  });

  it("una fila nueva que paga o recibe aparece sola en el Presupuesto; una acción, no", async () => {
    await como(reglas, "authenticated", MENA, async (c) => {
      await c.query("insert into personal.caja_config (inicio, colchon, margen) values ('2026-10-01', 0, 0)");
      await c.query("insert into personal.activos (id, clase, nombre, moneda, cantidad, tipo) values ('nueva', 'ahorros', 'Cuenta nueva', 'USD', 100, 'alto_rendimiento')");
      await c.query("insert into personal.activos (id, clase, nombre, moneda, cantidad, precio, tipo) values ('acc', 'rentavariable', 'Acción', 'USD', 1, 50, 'accion_etf')");
      const r = (await c.query("select registro_id, moneda, tipo from personal.caja_cuentas order by registro_id")).rows;
      expect(r).toEqual([{ registro_id: "nueva", moneda: "USD", tipo: "ahorro" }]);
      // Y la que se anotó antes de armar el Presupuesto entra cuando se arma.
    });
    await como(reglas, "authenticated", MENA, async (c) => {
      await c.query("insert into personal.activos (id, clase, nombre, moneda, cantidad, tipo) values ('antes', 'efectivo', 'Billetera', 'DOP', 500, 'efectivo')");
      expect((await c.query("select count(*)::int as n from personal.caja_cuentas")).rows[0].n).toBe(0);
      await c.query("insert into personal.caja_config (inicio, colchon, margen) values ('2026-10-01', 0, 0)");
      expect((await c.query("select registro_id from personal.caja_cuentas")).rows).toEqual([{ registro_id: "antes" }]);
    });
  });

  it("si se enlaza a mano una fila que ya se enlazó sola y sin historia, la nueva toma su lugar; con historia, no", async () => {
    await como(reglas, "authenticated", MENA, async (c) => {
      await c.query("insert into personal.caja_config (inicio, colchon, margen) values ('2026-10-01', 0, 0)");
      await c.query("insert into personal.activos (id, clase, subtipo, nombre, moneda, cantidad, saldo_fecha) values ('b', 'ahorros', 'corriente', 'Banco', 'DOP', 100, '2026-10-01')");
      await c.query("insert into personal.caja_cuentas (id, nombre, tipo, saldo_inicial, registro_id) values ('cb', 'x', 'banco', 100, 'b')");
      expect((await c.query("select id from personal.caja_cuentas")).rows).toEqual([{ id: "cb" }]);
      await c.query("insert into personal.caja_movimientos (fecha, tipo, monto, cuenta) values ('2026-10-02', 'gasto', 1, 'cb')");
      await debeFallar(c, "insert into personal.caja_cuentas (id, nombre, tipo, saldo_inicial, registro_id) values ('cb2', 'x', 'banco', 100, 'b')", /ya está en tu Presupuesto/);
    });
  });

  it("tipo y clase siempre de acuerdo; una cuenta que usa el Presupuesto no puede pasar a acción", async () => {
    await como(reglas, "authenticated", MENA, async (c) => {
      await c.query("insert into personal.caja_config (inicio, colchon, margen) values ('2026-10-01', 0, 0)");
      await c.query("insert into personal.activos (id, clase, nombre, moneda, cantidad) values ('x', 'rentafija', 'Certificado X', 'DOP', 100)");
      expect((await c.query("select tipo, tipo_confirmado from personal.activos where id = 'x'")).rows[0]).toEqual({ tipo: "certificado", tipo_confirmado: false });
      await c.query("update personal.activos set tipo = 'alto_rendimiento' where id = 'x'");
      expect((await c.query("select clase, subtipo from personal.activos where id = 'x'")).rows[0]).toEqual({ clase: "ahorros", subtipo: "alto_rendimiento" });
      await debeFallar(c, "update personal.activos set tipo = 'accion_etf', precio = 10 where id = 'x'", /la usa el Presupuesto/);
      // Lo que no aplica al tipo se limpia: débito fuera del alto rendimiento, cargos fuera de un préstamo.
      await c.query("insert into personal.activos (id, clase, nombre, moneda, cantidad, tipo, tiene_debito, cargos_cuota) values ('y', 'ahorros', 'Y', 'DOP', 1, 'ahorro', true, 5)");
      expect((await c.query("select tiene_debito, cargos_cuota from personal.activos where id = 'y'")).rows[0]).toEqual({ tiene_debito: null, cargos_cuota: null });
    });
  });

  it("estado de resultados: SQL = pantalla con cargos de un préstamo (gasto) y ahorro a una acción fuera del Presupuesto", async () => {
    await como(reglas, "authenticated", MENA, async (c) => {
      await c.query("insert into personal.caja_config (inicio, colchon, margen) values ('2026-10-01', 0, 0)");
      await c.query(`insert into personal.activos (id, clase, subtipo, nombre, moneda, cantidad, precio, tasa, saldo_fecha, tipo, cargos_cuota) values
        ('b', 'ahorros', 'corriente', 'Banco', 'DOP', 100000, 1, 0, '2026-10-01', 'corriente', null),
        ('p', 'prestamo', null, 'Préstamo', 'DOP', 320000, 1, 0.12, '2026-10-01', 'prestamo', 1200),
        ('v', 'rentavariable', null, 'VOO', 'DOP', 1, 500, 0, '2026-10-01', 'accion_etf', null)`);
      await c.query(`insert into personal.caja_categorias (id, nombre, tipo, adicional) values ('seg', 'Seguro', 'gasto', null), ('k2', 'Intereses', 'gasto_financiero', null)`);
      await c.query(`insert into personal.caja_movimientos (id, fecha, tipo, monto, cuenta, destino, categoria, interes, cargos, categoria_cargos, registro_destino) values
        ('c', '2026-10-20', 'pago_tarjeta', 10700, 'b', 'p', 'k2', 3200, 1200, 'seg', null),
        ('s', '2026-10-21', 'pago_tarjeta', 1000, 'b', 'p', null, null, 300, null, null),
        ('a', '2026-10-22', 'transferencia', 5000, 'b', null, null, null, null, null, 'v')`);
      await debeFallar(c, "insert into personal.caja_movimientos (fecha, tipo, monto, cuenta, destino, interes, cargos) values ('2026-10-20', 'pago_tarjeta', 100, 'b', 'p', 80, 30)", /cargos_pago_check/);
      const datos = filasADatos(await leer(c, COLUMNAS_COMPLETAS));
      const sqlR = (await c.query("select personal.resultado_mes('2026-10-15') as r")).rows[0].r;
      const ts = estadoDeResultados(datos, "2026-10");
      expect(sqlR.real.gastos).toBe("1500");
      expect(sqlR.real.gastos_financieros).toBe("3200");
      expect(sqlR.real.ahorro).toBe("5000");
      for (const [k, v] of [["gastos", ts.secciones.gasto.real], ["gastos_financieros", ts.secciones.gasto_financiero.real], ["ahorro", ts.secciones.ahorro_inversion.real], ["utilidad_neta", ts.utilidadNeta.real], ["disponible", ts.disponible.real]] as const) {
        expect([k, new Big(sqlR.real[k]).eq(v)]).toEqual([k, true]);
      }
      // La deuda bajó solo por el capital: 320,000 − 6,300 − 700.
      const sim = simular(datos, { hoy: "2026-10-23", hasta: "2026-10-23" });
      expect(sim.porFecha.get("2026-10-23")!.posiciones.p).toBe("-313000");
    });
  });

  it("RLS: otro usuario no ve ni las filas ni sus tipos", async () => {
    await reglas.query("insert into personal.activos (id, clase, nombre, moneda, cantidad) values ('secreta', 'efectivo', 'Secreta', 'DOP', 1)");
    await como(reglas, "authenticated", INTRUSO, async (c) => {
      expect((await c.query("select count(*)::int as n from personal.activos")).rows[0].n).toBe(0);
      await debeFallar(c, "insert into personal.activos (id, clase, nombre, moneda, cantidad) values ('x', 'efectivo', 'X', 'DOP', 1)", /row-level security/);
    });
    await reglas.query("delete from personal.activos where id = 'secreta'");
  });
});
