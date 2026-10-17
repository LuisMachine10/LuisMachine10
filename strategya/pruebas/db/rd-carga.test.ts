// Carga manual: funciones SECURITY DEFINER y RLS de mercado.fondos_rendimientos.
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { baseNueva, como, debeFallar } from "./base";

const MENA = "11111111-1111-1111-1111-111111111111";
const INTRUSO = "22222222-2222-2222-2222-222222222222";
const ENLACE = "https://www.boj.or.jp/en/mopo/mpmdeci/index.htm";

let pool: pg.Pool;

beforeAll(async () => {
  pool = await baseNueva("strategya_pruebas_rd_carga");
  await pool.query("insert into auth.users (id, email) values ($1, 'mena@ejemplo.do'), ($2, 'otro@ejemplo.do')", [MENA, INTRUSO]);
  await pool.query("insert into mercado.usuarios_autorizados (user_id) values ($1)", [MENA]);
});

afterAll(async () => {
  await pool?.end();
});

const cargar = (c: pg.PoolClient, serie: string, fecha: string, valor: string, url = ENLACE, nota: string | null = null) =>
  c.query("select mercado.cargar_dato_manual($1, $2::date, $3, $4, $5) as id", [serie, fecha, valor, url, nota]);

describe("mercado.cargar_dato_manual", () => {
  it("Mena carga la tasa del BoJ: queda en la bitácora y en observaciones con fuente manual y su enlace", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      const { rows } = await cargar(c, "TASA_BOJ", "2026-09-19", "0.75", ENLACE, "Comunicado de política monetaria");
      expect(Number(rows[0].id)).toBeGreaterThan(0);
      await cargar(c, "TASA_BOJ", "2026-10-01", "1.00");
      const bitacora = await c.query("select dato, serie_id, valor::text, fecha::text, url_fuente, creado_por from mercado.carga_manual order by fecha");
      expect(bitacora.rows[0]).toEqual({
        dato: "BoJ · tasa de política",
        serie_id: "TASA_BOJ",
        valor: "0.75",
        fecha: "2026-09-19",
        url_fuente: ENLACE,
        creado_por: MENA,
      });
      const obs = await c.query(
        "select fecha_dato::text, valor::text, cambio::text, fuente_id, url_dato from mercado.observaciones where serie_id = 'TASA_BOJ' order by fecha_dato",
      );
      expect(obs.rows).toEqual([
        { fecha_dato: "2026-09-19", valor: "0.75", cambio: null, fuente_id: "manual", url_dato: ENLACE },
        { fecha_dato: "2026-10-01", valor: "1.00", cambio: "0.25", fuente_id: "manual", url_dato: ENLACE },
      ]);
    });
  });

  it("corregir un dato manual del mismo día lo reemplaza y recalcula el cambio", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await cargar(c, "TASA_BOJ", "2026-09-19", "0.75");
      await cargar(c, "TASA_BOJ", "2026-10-01", "1.00");
      await cargar(c, "TASA_BOJ", "2026-10-01", "0.95");
      const obs = await c.query("select valor::text, cambio::text from mercado.observaciones where serie_id = 'TASA_BOJ' and fecha_dato = '2026-10-01'");
      expect(obs.rows).toEqual([{ valor: "0.95", cambio: "0.20" }]);
    });
  });

  it("no reemplaza un dato oficial leído automáticamente", async () => {
    // Dato oficial ya confirmado (fuera de las transacciones que se revierten).
    await pool.query(`select * from mercado.registrar_observaciones(null, '[{"serie_id":"COMB_GLP","valor":"135.20","fecha_dato":"2026-10-10"}]'::jsonb)`);
    await como(pool, "authenticated", MENA, async (c) => {
      await debeFallar(c, "select mercado.cargar_dato_manual('COMB_GLP', '2026-10-10', '140', 'https://micm.gob.do/')", /Ya hay un dato oficial/);
      // Otra semana sin dato oficial sí se puede cargar.
      await cargar(c, "COMB_GLP", "2026-10-17", "135.20", "https://micm.gob.do/aviso/");
    });
  });

  it("valida serie, valor, fecha y enlace con mensajes en español", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await debeFallar(c, "select mercado.cargar_dato_manual('NO_EXISTE', '2026-10-01', '1', 'https://x.do')", /Serie desconocida/);
      await debeFallar(c, "select mercado.cargar_dato_manual('TASA_BOJ', '2026-10-01', '1,5', 'https://x.do')", /número con punto decimal/);
      await debeFallar(c, "select mercado.cargar_dato_manual('TASA_BOJ', '2026-10-01', '1e3', 'https://x.do')", /número con punto decimal/);
      await debeFallar(c, "select mercado.cargar_dato_manual('TASA_BOJ', '2099-01-01', '1', 'https://x.do')", /Fecha del dato inválida/);
      await debeFallar(c, "select mercado.cargar_dato_manual('TASA_BOJ', '2026-10-01', '1', 'ftp://x.do')", /Falta el enlace/);
      await debeFallar(c, "select mercado.cargar_dato_manual('TASA_BOJ', '2026-10-01', '1', null)", /Falta el enlace/);
    });
  });

  it("un usuario no autorizado o anónimo no puede cargar", async () => {
    await como(pool, "authenticated", INTRUSO, (c) =>
      debeFallar(c, "select mercado.cargar_dato_manual('TASA_BOJ', '2026-10-01', '1', 'https://x.do')", /No autorizado/),
    );
    await como(pool, "anon", null, (c) =>
      debeFallar(c, "select mercado.cargar_dato_manual('TASA_BOJ', '2026-10-01', '1', 'https://x.do')", /permission denied/),
    );
  });
});

describe("mercado.cargar_emision_manual", () => {
  const sql = `select mercado.cargar_emision_manual($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10) as id`;

  it("Mena registra una resolución de la SIMV y la corrige", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await c.query(sql, ["SIMV", "R-SIMV-2026-41-EV", "2026-10-08", "https://simv.gob.do/resolucion.pdf", "Emisor S. A.", "Bonos corporativos", "500000000", "DOP", "9.75", "Aprueba programa de emisiones"]);
      await c.query(sql, ["SIMV", "R-SIMV-2026-41-EV", "2026-10-08", "https://simv.gob.do/resolucion.pdf", "Emisor S. A.", "Bonos corporativos", "600000000.50", "DOP", "9.75", null]);
      const { rows } = await c.query("select fuente, numero, monto::text, tasa::text, moneda, origen from mercado.emisiones_rd");
      expect(rows).toEqual([
        { fuente: "SIMV", numero: "R-SIMV-2026-41-EV", monto: "600000000.50", tasa: "9.75", moneda: "DOP", origen: "manual" },
      ]);
    });
  });

  it("rechaza fuentes automáticas, números con comas y emisiones que ya vinieron de la ingesta", async () => {
    await pool.query(
      "insert into mercado.emisiones_rd (fuente, numero, fecha, url, origen) values ('BVRD', 'HR-1', '2026-10-01', 'https://bvrd.com.do/', 'automatica')",
    );
    await como(pool, "authenticated", MENA, async (c) => {
      await debeFallar(c, sql, /solo se cargan resoluciones/, ["CREDITO_PUBLICO", "X", "2026-10-01", "https://x.do", null, null, null, null, null, null]);
      await debeFallar(c, sql, /Monto inválido/, ["BVRD", "HR-2", "2026-10-01", "https://x.do", null, null, "1,000", null, null, null]);
      await debeFallar(c, sql, /Moneda inválida/, ["BVRD", "HR-2", "2026-10-01", "https://x.do", null, null, null, "EUR", null, null]);
      await debeFallar(c, sql, /ya la registró la lectura automática/, ["BVRD", "HR-1", "2026-10-01", "https://x.do", null, null, null, null, null, null]);
    });
    await como(pool, "authenticated", INTRUSO, (c) =>
      debeFallar(c, sql, /No autorizado/, ["SIMV", "X", "2026-10-01", "https://x.do", null, null, null, null, null, null]),
    );
  });
});

describe("mercado.fondos_rendimientos (RLS)", () => {
  const fila = ["SAFI Ejemplo", "Fondo Abierto de Liquidez", "DOP", 30, "6.85", "2026-10-14", "https://www.ejemplo.do/fondos/liquidez"];
  const insertar = `insert into mercado.fondos_rendimientos (safi, fondo, moneda, plazo_dias, rendimiento, fecha_corte, url_fuente)
                    values ($1, $2, $3, $4, $5::numeric, $6::date, $7)`;

  it("Mena carga, lee, corrige y borra; el valor se guarda exacto", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await c.query(insertar, fila);
      const { rows } = await c.query("select rendimiento::text, creado_por from mercado.fondos_rendimientos");
      expect(rows).toEqual([{ rendimiento: "6.85", creado_por: MENA }]);
      await c.query("update mercado.fondos_rendimientos set rendimiento = 6.9 where fondo = $1", [fila[1]]);
      await c.query("delete from mercado.fondos_rendimientos");
      expect((await c.query("select count(*)::int as n from mercado.fondos_rendimientos")).rows[0].n).toBe(0);
    });
  });

  it("rechaza plazos fuera de 30/60/90/180/360/365, monedas raras, duplicados y enlaces vacíos", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await debeFallar(c, insertar, /plazo_dias_check/, [fila[0], fila[1], "DOP", 45, "6", "2026-10-14", fila[6]]);
      await debeFallar(c, insertar, /moneda_check/, [fila[0], fila[1], "EUR", 30, "6", "2026-10-14", fila[6]]);
      await debeFallar(c, insertar, /url_fuente_check/, [fila[0], fila[1], "DOP", 30, "6", "2026-10-14", "sin enlace"]);
      await c.query(insertar, fila);
      await debeFallar(c, insertar, /duplicate key/, fila);
    });
  });

  it("un intruso no lee ni escribe", async () => {
    await pool.query(insertar, fila);
    expect((await pool.query("select count(*)::int as n from mercado.fondos_rendimientos")).rows[0].n).toBe(1);
    await como(pool, "authenticated", INTRUSO, async (c) => {
      expect((await c.query("select count(*)::int as n from mercado.fondos_rendimientos")).rows[0].n).toBe(0);
      await debeFallar(c, insertar, /row-level security/, [fila[0], "Otro", "USD", 365, "4", "2026-10-14", fila[6]]);
    });
    await como(pool, "anon", null, (c) => debeFallar(c, "select * from mercado.fondos_rendimientos", /permission denied/));
  });
});
