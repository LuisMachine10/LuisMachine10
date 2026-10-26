// Fase F contra Postgres real (migraciones 20261027000100_deudas_y_dolares y 20261027000200_mantenimiento_cron).
// Casos reales SIMULADOS (cifras inventadas, no son de Mena): la cuota de un préstamo con tasa y el pago de
// una tarjeta con interés; una cuenta en US$ con el dólar del BCRD; «Omitir este mes»; la limpieza semanal
// de pg_cron; y la revisión de la conexión Portafolio ↔ Presupuesto leyendo de la base.

import Big from "big.js";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { COLUMNAS_COMPLETAS, type FilasCaja, filasADatos, ORDEN } from "../../lib/caja/filas";
import { aJsonSQL } from "../../lib/caja/importar";
import { estadoDeResultados } from "../../lib/caja/resultados";
import { separarPago } from "../../lib/caja/deudas";
import { hoyRD } from "../../lib/caja/fechas";
import type { TasasUSD } from "../../lib/caja/tasas";
import type { DatosCaja } from "../../lib/caja/tipos";
import { revisarConexion } from "../../lib/capital/conexion";
import { COLUMNAS_REGISTRO, conSaldosVigentes, filaARegistro } from "../../lib/capital/registro";
import { baseNueva, como, debeFallar } from "./base";

const MENA = "11111111-1111-1111-1111-111111111111";
const INTRUSO = "22222222-2222-2222-2222-222222222222";
const TABLAS = ["caja_config", "caja_cuentas", "caja_categorias", "caja_recurrentes", "caja_movimientos", "caja_omitidos", "caja_saldos_reales", "caja_notas"] as const;

let pool: pg.Pool;

beforeAll(async () => {
  pool = await baseNueva("strategya_pruebas_fase_f");
  await pool.query("insert into auth.users (id, email) values ($1, 'mena@ejemplo.do'), ($2, 'otro@ejemplo.do')", [MENA, INTRUSO]);
  await pool.query("insert into mercado.usuarios_autorizados (user_id) values ($1)", [MENA]);
  // Dólar de venta del BCRD inventado: jueves 8 y viernes 9 de octubre, y miércoles 14.
  await pool.query(`insert into mercado.observaciones (serie_id, valor, fecha_dato, fuente_id) values
    ('USDDOP_VENTA', 60.80, '2026-10-08', 'bcrd'), ('USDDOP_VENTA', 61.00, '2026-10-09', 'bcrd'), ('USDDOP_VENTA', 62.00, '2026-10-14', 'bcrd')`);
});

afterAll(async () => {
  await pool?.end();
});

/** El Presupuesto leído como lo lee la app (columnas completas), con la tasa de las deudas y el dólar BCRD. */
async function leerCaja(c: pg.PoolClient): Promise<DatosCaja> {
  const f: Record<string, unknown>[][] = [];
  for (const t of TABLAS) {
    const orden = (ORDEN as Record<string, readonly string[]>)[t];
    f.push((await c.query(`select ${COLUMNAS_COMPLETAS[t]} from personal.${t}${orden ? ` order by ${orden.join(", ")}` : ""}`)).rows);
  }
  const [config, cuentas, categorias, recurrentes, movimientos, omitidos, saldos, notas] = f;
  const datos = filasADatos({ config: config[0] ?? null, cuentas, categorias, recurrentes, movimientos, omitidos, saldos, notas } as FilasCaja);
  const tasas = (await c.query("select c.id, a.tasa::text from personal.caja_cuentas c join personal.activos a on a.id = c.registro_id where a.clase in ('prestamo', 'deuda') and a.tasa > 0")).rows;
  for (const t of tasas) {
    const cu = datos.cuentas.find((x) => x.id === t.id);
    if (cu) cu.tasaAnual = t.tasa;
  }
  const serie = (await c.query("select fecha_dato::text as fecha, valor::text, url_dato as url from mercado.observaciones where serie_id = 'USDDOP_VENTA' and hora_dato is null and estado = 'ok' order by fecha_dato")).rows;
  datos.tasasUSD = { hoy: hoyRD(), serie } as TasasUSD;
  return datos;
}

async function registro(c: pg.PoolClient, caja: DatosCaja, hoy: string) {
  const enl = (await c.query("select id, registro_id from personal.caja_cuentas")).rows as { id: string; registro_id: string }[];
  const filas = (await c.query(`select ${COLUMNAS_REGISTRO} from personal.activos order by orden, id`)).rows;
  return conSaldosVigentes(filas.map((x) => filaARegistro(x, enl.find((e) => e.registro_id === x.id)?.id ?? null)), caja, hoy);
}

/** Mena: un préstamo del carro con 12 % (RD$ 320,000), una Visa (RD$ 12,000), banco y una cuenta en dólares. */
async function sembrar(c: pg.PoolClient) {
  await c.query("insert into personal.caja_config (inicio, colchon, margen) values ('2026-10-01', 5000, 3000)");
  await c.query(`insert into personal.activos (id, clase, subtipo, nombre, institucion, moneda, cantidad, precio, tasa, cuota, saldo_fecha) values
    ('banco', 'ahorros', 'corriente', 'Popular nómina', '', 'DOP', 100000, 1, 0, null, '2026-10-01'),
    ('carro', 'prestamo', null, 'Préstamo del carro', 'BHD', 'DOP', 320000, 1, 0.12, 9500, '2026-10-01'),
    ('visa', 'tarjeta', null, 'Visa', '', 'DOP', 12000, 1, 0.6, null, '2026-10-01'),
    ('dolares', 'ahorros', 'ahorro', 'Cuenta en dólares', '', 'USD', 1000, 1, 0.01, null, '2026-10-01')`);
  await c.query(`insert into personal.caja_cuentas (id, nombre, tipo, saldo_inicial, orden, registro_id) values
    ('cb', '?', 'banco', 100000, 1, 'banco'), ('cp', '?', 'prestamo', 320000, 2, 'carro'), ('cv', '?', 'tarjeta', 12000, 3, 'visa'), ('cu', '?', 'ahorro', 1000, 4, 'dolares')`);
  await c.query(`insert into personal.caja_categorias (id, nombre, tipo, adicional) values
    ('k1', 'Comida', 'gasto', 12000), ('k2', 'Intereses del carro', 'gasto_financiero', 3200), ('k3', 'Ahorro', 'ahorro_inversion', 10000)`);
}

describe("1 · pagos de tarjetas y préstamos: la deuda baja solo por el capital", () => {
  it("la cuota del préstamo con tasa: 3,200 de interés y 6,300 de capital, en los dos lados y en el estado de resultados", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await sembrar(c);
      const caja = await leerCaja(c);
      // Lo que hace la acción «registrar»: separa con la tasa del registro (lo que debía el día anterior × 12 % ÷ 12).
      const sep = separarPago(caja, { monto: "9500", moneda: "DOP", destino: "cp", fecha: "2026-10-20" }, undefined);
      expect(sep).toMatchObject({ interes: "3200", capital: "6300", como: "tasa" });
      await c.query("insert into personal.caja_movimientos (id, fecha, tipo, monto, cuenta, destino, categoria, interes) values ('cuota', '2026-10-20', 'pago_tarjeta', 9500, 'cb', 'cp', 'k2', $1)", [sep.interes]);
      // Tarjeta: el estado de cuenta dice que 800 fueron intereses (Mena escribe el capital: 4,200).
      await c.query("insert into personal.caja_movimientos (id, fecha, tipo, monto, cuenta, destino, interes) values ('tc', '2026-10-21', 'pago_tarjeta', 5000, 'cb', 'cv', 800)");
      const despues = await leerCaja(c);
      const reg = await registro(c, despues, "2026-10-22");
      const v = Object.fromEntries(reg.map((i) => [i.id, i.cantidad]));
      expect(v).toMatchObject({ carro: "313700", visa: "7800", banco: "85500" });
      // Estado de resultados: SQL y pantalla dan lo mismo; el capital no es gasto.
      const sql = (await c.query("select personal.resultado_mes('2026-10-15') as r")).rows[0].r;
      const ts = estadoDeResultados(despues, "2026-10");
      expect(sql.real.gastos_financieros).toBe("4000");
      expect(new Big(sql.real.gastos_financieros).eq(ts.secciones.gasto_financiero.real)).toBe(true);
      expect(new Big(sql.real.gastos_totales).eq(ts.gastosTotales.real)).toBe(true);
      expect(new Big(sql.real.utilidad_neta).eq(ts.utilidadNeta.real)).toBe(true);
      expect(new Big(sql.presupuestado.gastos_financieros).eq(ts.secciones.gasto_financiero.presupuestado)).toBe(true);
      // La revisión de la conexión: las cuatro cuentas cuadran.
      const r = revisarConexion(reg, despues, "2026-10-22");
      expect(r.cuentas.map((x) => [x.nombre, x.cuadra])).toEqual([["Popular nómina", true], ["Préstamo del carro", true], ["Visa", true], ["Cuenta en dólares", true]]);
    });
  });

  it("la base protege el interés: solo en pagos, nunca mayor que el pago ni negativo", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await sembrar(c);
      await debeFallar(c, "insert into personal.caja_movimientos (fecha, tipo, monto, cuenta, interes) values ('2026-10-02', 'gasto', 100, 'cb', 10)", /interes_pago_check/);
      await debeFallar(c, "insert into personal.caja_movimientos (fecha, tipo, monto, cuenta, destino, interes) values ('2026-10-02', 'pago_tarjeta', 100, 'cb', 'cv', 101)", /interes_pago_check/);
      await debeFallar(c, "insert into personal.caja_movimientos (fecha, tipo, monto, cuenta, destino, interes) values ('2026-10-02', 'pago_tarjeta', 100, 'cb', 'cv', -1)", /interes_check/);
    });
  });

  it("importar el Presupuesto conserva el interés de cada pago y la moneda de cada cuenta", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await sembrar(c);
      await c.query("insert into personal.caja_movimientos (id, fecha, tipo, monto, cuenta, destino, interes) values ('tc', '2026-10-21', 'pago_tarjeta', 5000, 'cb', 'cv', 800)");
      const antes = await leerCaja(c);
      await c.query("select personal.caja_importar($1::jsonb)", [JSON.stringify(aJsonSQL({ ...antes, config: antes.config! }))]);
      const despues = await leerCaja(c);
      expect(despues.movimientos.find((m) => m.id === "tc")?.interes).toBe("800");
      expect(despues.cuentas.find((x) => x.id === "cu")?.moneda).toBe("USD");
      expect((await c.query("select registro_id from personal.caja_cuentas where id = 'cu'")).rows[0].registro_id).toBe("dolares");
    });
  });
});

describe("2 · cuentas en US$ con el dólar oficial del BCRD de la fecha", () => {
  it("personal.tasa_usd_bcrd: el último publicado hasta la fecha, como mucho 7 días antes", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      const t = async (f: string) => (await c.query("select personal.tasa_usd_bcrd($1::date)::text as t", [f])).rows[0].t;
      expect(await t("2026-10-09")).toBe("61.00");
      expect(await t("2026-10-11")).toBe("61.00"); // domingo: el del viernes
      expect(await t("2026-10-15")).toBe("62.00");
      expect(await t("2026-10-07")).toBeNull(); // antes del primer dato: no confirmado
      expect(await t("2026-10-22")).toBeNull(); // 8 días después del último: no confirmado
    });
    // Un usuario no autorizado no ve el dato (RLS de mercado): null.
    await como(pool, "authenticated", INTRUSO, async (c) => {
      expect((await c.query("select personal.tasa_usd_bcrd('2026-10-09') as t")).rows[0].t).toBeNull();
    });
  });

  it("la cuenta en US$ queda enlazada en US$; sus movimientos se guardan en US$ y suman en RD$ con su tasa", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await sembrar(c);
      expect((await c.query("select moneda from personal.caja_cuentas where id = 'cu'")).rows[0].moneda).toBe("USD");
      await c.query(`insert into personal.caja_movimientos (id, fecha, tipo, monto, moneda, tasa, cuenta, categoria) values
        ('u1', '2026-10-11', 'gasto', 100, 'USD', null, 'cu', 'k1'),
        ('u2', '2026-10-12', 'gasto', 10, 'USD', 60.5, 'cu', 'k1'),
        ('u3', '2026-10-25', 'gasto', 7, 'USD', null, 'cu', 'k1')`);
      const caja = await leerCaja(c);
      const ts = estadoDeResultados(caja, "2026-10");
      const sql = (await c.query("select personal.resultado_mes('2026-10-01') as r")).rows[0].r;
      // 100 × 61 (BCRD del viernes 9) + 10 × 60.5 (tasa propia). Los US$ 7 del 25: sin dato del BCRD en 7 días → no se suman.
      expect(ts.secciones.gasto.real).toBe("6705");
      expect(new Big(sql.real.gastos).eq("6705")).toBe(true);
      expect(ts.sinTasa).toBe(1);
      expect(ts.conversiones.map((x) => [x.id, x.tasa?.valor ?? null])).toEqual([["u1", "61.00"], ["u2", "60.5"], ["u3", null]]);
      // El saldo de la cuenta en el registro sigue en US$.
      const reg = await registro(c, caja, "2026-10-26");
      expect(reg.find((i) => i.id === "dolares")?.cantidad).toBe("883");
    });
  });

  it("protege la moneda: no cambia mientras el Presupuesto la usa; € no entra", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await sembrar(c);
      await debeFallar(c, "update personal.activos set moneda = 'DOP' where id = 'dolares'", /la usa el Presupuesto en USD/);
      await c.query("update personal.caja_cuentas set moneda = 'DOP' where id = 'cu'"); // desde el Presupuesto se ignora
      expect((await c.query("select moneda from personal.caja_cuentas where id = 'cu'")).rows[0].moneda).toBe("USD");
      await c.query("insert into personal.activos (id, clase, nombre, moneda, cantidad) values ('eur', 'ahorros', 'Euros', 'EUR', 5)");
      await debeFallar(c, "insert into personal.caja_cuentas (nombre, tipo, registro_id) values ('x', 'banco', 'eur')", /RD\$ o US\$/);
    });
  });
});

// 3 · «Omitir este mes» y reubicar la parte de un vencido se retiraron en el Núcleo v2 (el plan va en montos por
// instrumento): ver pruebas/db/nucleo-v2.test.ts.

describe("6 · mantenimiento: limpieza semanal del historial de pg_cron", () => {
  it("queda programada los domingos y borra solo lo de más de 14 días", async () => {
    const { rows } = await pool.query("select schedule, command from cron.job where jobname = 'strategya-limpiar-historial-cron'");
    expect(rows).toHaveLength(1);
    expect(rows[0].schedule).toBe("17 4 * * 0");
    await pool.query("delete from cron.job_run_details");
    await pool.query("insert into cron.job_run_details (end_time) values (now() - interval '30 days'), (now() - interval '15 days'), (now() - interval '13 days'), (now())");
    await pool.query(rows[0].command);
    expect((await pool.query("select count(*)::int as n from cron.job_run_details")).rows[0].n).toBe(2);
  });
});

describe("7 · revisar la conexión: detecta lo que no cuadra sin cambiar nada", () => {
  it("un fijo de hoy sin confirmar explica la diferencia; la lectura no escribe nada", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await sembrar(c);
      await c.query("insert into personal.caja_recurrentes (id, nombre, tipo, monto, cuenta, categoria, dias) values ('r', 'Supermercado', 'gasto', 3000, 'cb', 'k1', '20')");
      const caja = await leerCaja(c);
      const antes = (await c.query("select count(*)::int as n from personal.caja_saldos_reales")).rows[0].n;
      const r = revisarConexion(await registro(c, caja, "2026-10-20"), caja, "2026-10-20");
      const b = r.cuentas.find((x) => x.cajaId === "cb")!;
      expect(b).toMatchObject({ portafolio: "100000.00", presupuesto: "97000.00", cuadra: false });
      expect(b.motivos[0]).toMatch(/Supermercado/);
      expect(r.cuentas.filter((x) => x.cuadra)).toHaveLength(3);
      expect((await c.query("select count(*)::int as n from personal.caja_saldos_reales")).rows[0].n).toBe(antes);
    });
  });
});
