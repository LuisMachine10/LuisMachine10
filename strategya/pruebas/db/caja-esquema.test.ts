import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { COLUMNAS, type FilasCaja, filasADatos, ORDEN } from "../../lib/caja/filas";
import { aJsonSQL, parsearImportacion } from "../../lib/caja/importar";
import { resumir, simular } from "../../lib/caja/motor";
import { EJEMPLO } from "../apoyo/caja-ejemplo";
import { baseNueva, como, debeFallar } from "./base";

// Usuarios inventados para las pruebas.
const MENA = "11111111-1111-1111-1111-111111111111";
const INTRUSO = "22222222-2222-2222-2222-222222222222";

const TABLAS = [
  "caja_config", "caja_cuentas", "caja_categorias", "caja_recurrentes",
  "caja_movimientos", "caja_omitidos", "caja_saldos_reales", "caja_notas",
] as const;

let pool: pg.Pool;

beforeAll(async () => {
  pool = await baseNueva("strategya_pruebas_caja_esquema");
  await pool.query("insert into auth.users (id, email) values ($1, 'mena@ejemplo.do'), ($2, 'otro@ejemplo.do')", [MENA, INTRUSO]);
  await pool.query("insert into mercado.usuarios_autorizados (user_id) values ($1)", [MENA]);
});

afterAll(async () => {
  await pool?.end();
});

/** Lee la caja con las mismas columnas (::text) y el mismo orden que usa la app por PostgREST. */
async function leer(c: pg.PoolClient): Promise<FilasCaja> {
  const q = async (t: (typeof TABLAS)[number]) => {
    const orden = (ORDEN as Record<string, readonly string[]>)[t];
    const r = await c.query(`select ${COLUMNAS[t]} from personal.${t}${orden ? ` order by ${orden.join(", ")}` : ""}`);
    return r.rows as Record<string, unknown>[];
  };
  const filas: Record<string, unknown>[][] = [];
  for (const t of TABLAS) filas.push(await q(t)); // un solo cliente: consultas una tras otra
  const [config, cuentas, categorias, recurrentes, movimientos, omitidos, saldos, notas] = filas;
  return { config: config[0] ?? null, cuentas, categorias, recurrentes, movimientos, omitidos, saldos, notas };
}

async function importar(c: pg.PoolClient, datos: unknown) {
  const r = await c.query("select personal.caja_importar($1::jsonb) as r", [JSON.stringify(datos)]);
  return r.rows[0].r as Record<string, number>;
}

describe("Calendario de Caja · esquema y RLS", () => {
  it("las tablas existen en personal con RLS activo", async () => {
    const r = await pool.query(
      "select relname, relrowsecurity from pg_class where relnamespace = 'personal'::regnamespace and relkind = 'r' and relname like 'caja_%' order by relname",
    );
    expect(r.rows.map((x) => x.relname).sort()).toEqual([...TABLAS].sort());
    expect(r.rows.every((x) => x.relrowsecurity)).toBe(true);
  });

  it("Mena agrega, lee, corrige y borra; los montos vuelven exactos", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await c.query("insert into personal.caja_config (inicio, colchon, margen, tasa_usd) values ('2026-10-01', 5000, 3000, 60.123456789)");
      await c.query("insert into personal.caja_cuentas (id, nombre, tipo, saldo_inicial) values ('b', 'Banco', 'banco', 1000.10)");
      const { rows } = await c.query(
        "insert into personal.caja_movimientos (fecha, tipo, monto, cuenta) values ('2026-10-02', 'gasto', 0.1, 'b'), ('2026-10-02', 'gasto', 0.2, 'b') returning id",
      );
      expect(rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
      await c.query("insert into personal.caja_omitidos values ('2026-10-03', 'r')");
      await c.query("insert into personal.caja_saldos_reales (fecha, cuenta_id, saldo) values ('2026-10-03', 'b', 999.99)");
      await c.query("insert into personal.caja_notas (fecha, nota) values ('2026-10-03', 'hola')");
      await c.query("update personal.caja_movimientos set monto = 0.3 where id = $1", [rows[1].id]);
      const suma = await c.query("select sum(monto)::text as s from personal.caja_movimientos");
      expect(suma.rows[0].s).toBe("0.4");
      const datos = filasADatos(await leer(c));
      expect(datos.config).toEqual({ inicio: "2026-10-01", colchon: "5000", margen: "3000", tasaUSD: "60.123456789" });
      expect(datos.cuentas[0].saldoInicial).toBe("1000.10");
      expect(datos.saldos).toEqual([{ fecha: "2026-10-03", cuentaId: "b", saldo: "999.99" }]);
      await c.query("delete from personal.caja_movimientos where id = $1", [rows[0].id]);
      expect((await c.query("select count(*)::int as n from personal.caja_movimientos")).rows[0].n).toBe(1);
    });
  });

  it("las restricciones protegen el modelo", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await debeFallar(c, "insert into personal.caja_config (id, inicio) values (2, '2026-10-01')", /caja_config_id_check/);
      await debeFallar(c, "insert into personal.caja_cuentas (nombre, tipo) values ('X', 'cripto')", /caja_cuentas_tipo_check/);
      await debeFallar(c, "insert into personal.caja_movimientos (fecha, tipo, monto) values ('2026-10-01', 'gasto', -1)", /monto_check/);
      await debeFallar(c, "insert into personal.caja_movimientos (fecha, tipo, monto, moneda) values ('2026-10-01', 'gasto', 1, 'EUR')", /moneda_check/);
      await debeFallar(c, "insert into personal.caja_recurrentes (nombre, tipo, pago_total) values ('X', 'gasto', true)", /check/);
    });
  });

  it("un usuario no autorizado no ve ni escribe nada; anon no tiene permiso", async () => {
    await pool.query("insert into personal.caja_notas (fecha, nota) values ('2026-01-01', 'secreta')");
    try {
      await como(pool, "authenticated", INTRUSO, async (c) => {
        for (const t of TABLAS) expect((await c.query(`select count(*)::int as n from personal.${t}`)).rows[0].n).toBe(0);
        await debeFallar(c, "insert into personal.caja_notas (fecha, nota) values ('2026-01-02', 'x')", /row-level security/);
        const borradas = await c.query("delete from personal.caja_notas");
        expect(borradas.rowCount).toBe(0);
      });
      await como(pool, "anon", null, async (c) => {
        await debeFallar(c, "select * from personal.caja_notas", /permission denied/);
        await debeFallar(c, "select personal.caja_importar('{}'::jsonb)", /permission denied/);
      });
      await como(pool, "authenticated", MENA, async (c) => {
        expect((await c.query("select nota from personal.caja_notas")).rows).toEqual([{ nota: "secreta" }]);
      });
    } finally {
      await pool.query("delete from personal.caja_notas");
    }
  });
});

describe("Calendario de Caja · importación", () => {
  const parseado = parsearImportacion(EJEMPLO);
  const json = aJsonSQL(parseado.datos!);

  it("importa el JSON del artefacto, y lo leído es igual a lo importado", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      expect(await importar(c, json)).toEqual({ cuentas: 4, categorias: 2, recurrentes: 4, movimientos: 4, omitidos: 1, saldos: 2, notas: 1 });
      const datos = filasADatos(await leer(c));
      expect(datos).toEqual(parseado.datos);
      // El motor da lo mismo con lo leído de la base.
      const hoy = "2026-10-20";
      const a = simular(datos, { hoy, hasta: "2026-12-31" });
      const b = simular(parseado.datos!, { hoy, hasta: "2026-12-31" });
      expect(a.dias).toEqual(b.dias);
      expect(resumir(a, datos.config).disponibleHoy).toBe(resumir(b, parseado.datos!.config).disponibleHoy);
    });
  });

  it("reemplaza todo lo anterior (no suma) y conserva el orden de registro", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await c.query("insert into personal.caja_movimientos (id, fecha, tipo, monto) values ('viejo', '2025-01-01', 'gasto', 1)");
      await importar(c, json);
      await importar(c, json);
      const ids = (await c.query("select id from personal.caja_movimientos order by fecha, n")).rows.map((r) => r.id);
      expect(ids).toEqual(["i1", "i2", "i3", "i1-2"]);
    });
  });

  it("si algo falla a mitad, no cambia nada", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await importar(c, json);
      const malo = { ...json, movimientos: [...json.movimientos, { ...json.movimientos[0], id: "x", tipo: "regalo" }] };
      await debeFallar(c, "select personal.caja_importar($1::jsonb)", /caja_movimientos_tipo_check/, [JSON.stringify(malo)]);
      expect((await c.query("select count(*)::int as n from personal.caja_movimientos")).rows[0].n).toBe(4);
      await debeFallar(c, "select personal.caja_importar('[]'::jsonb)", /falta config/);
    });
  });

  it("solo Mena puede importar (la función verifica aunque sea SECURITY DEFINER)", async () => {
    await como(pool, "authenticated", INTRUSO, async (c) => {
      await debeFallar(c, "select personal.caja_importar($1::jsonb)", /No autorizado/, [JSON.stringify(json)]);
    });
    expect((await pool.query("select count(*)::int as n from personal.caja_cuentas")).rows[0].n).toBe(0);
  });
});
