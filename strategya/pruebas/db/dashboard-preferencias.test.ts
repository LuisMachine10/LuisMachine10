import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { normalizar, porDefecto } from "../../lib/dashboard/disposicion";
import { baseNueva, como, debeFallar } from "./base";

// Usuarios inventados para las pruebas.
const MENA = "11111111-1111-1111-1111-111111111111";
const OTRO = "22222222-2222-2222-2222-222222222222";

let pool: pg.Pool;

beforeAll(async () => {
  pool = await baseNueva("strategya_pruebas_dashboard_preferencias");
  await pool.query("insert into auth.users (id, email) values ($1, 'mena@ejemplo.do'), ($2, 'otro@ejemplo.do')", [MENA, OTRO]);
  await pool.query("insert into mercado.usuarios_autorizados (user_id) values ($1)", [MENA]);
});

afterAll(async () => {
  await pool?.end();
});

describe("Dashboard · personal.preferencias", () => {
  it("la tabla tiene RLS activo", async () => {
    const r = await pool.query("select relrowsecurity from pg_class where oid = 'personal.preferencias'::regclass");
    expect(r.rows[0].relrowsecurity).toBe(true);
  });

  it("Mena guarda, lee y reemplaza su disposición con la función; user_id sale de la sesión", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      const d = porDefecto();
      const r1 = await c.query("select personal.guardar_preferencia('dashboard', $1::jsonb) as t", [JSON.stringify(d)]);
      expect(r1.rows[0].t).toBeInstanceOf(Date);
      const leida = await c.query("select user_id, valor from personal.preferencias where clave = 'dashboard'");
      expect(leida.rows).toHaveLength(1);
      expect(leida.rows[0].user_id).toBe(MENA);
      expect(normalizar(leida.rows[0].valor)).toEqual(d);

      const cambiada = { ...d, widgets: d.widgets.map((w, i) => (i === 0 ? { ...w, visible: false } : w)) };
      await c.query("select personal.guardar_preferencia('dashboard', $1::jsonb)", [JSON.stringify(cambiada)]);
      const otra = await c.query("select valor from personal.preferencias where clave = 'dashboard'");
      expect(otra.rows).toHaveLength(1);
      expect(otra.rows[0].valor.widgets[0].visible).toBe(false);

      await c.query("insert into personal.preferencias (clave, valor) values ('noticias', '{\"palabras\":[\"petróleo\"]}')");
      expect((await c.query("select count(*)::int as n from personal.preferencias")).rows[0].n).toBe(2);
      await c.query("delete from personal.preferencias where clave = 'noticias'");
      expect((await c.query("select count(*)::int as n from personal.preferencias")).rows[0].n).toBe(1);
    });
  });

  it("Mena no puede escribir a nombre de otro usuario", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await debeFallar(c, `insert into personal.preferencias (user_id, clave, valor) values ('${OTRO}', 'dashboard', '{}')`, /row-level security/);
    });
  });

  it("un usuario no autorizado no lee ni escribe; anon no tiene acceso", async () => {
    await pool.query("insert into personal.preferencias (user_id, clave, valor) values ($1, 'dashboard', '{\"widgets\":[]}')", [MENA]);
    await como(pool, "authenticated", OTRO, async (c) => {
      expect((await c.query("select * from personal.preferencias")).rows).toHaveLength(0);
      await debeFallar(c, "select personal.guardar_preferencia('dashboard', '{}'::jsonb)", /row-level security/);
      await debeFallar(c, "insert into personal.preferencias (clave, valor) values ('dashboard', '{}')", /row-level security/);
      const u = await c.query("update personal.preferencias set valor = '{}' returning *");
      expect(u.rowCount).toBe(0);
      const b = await c.query("delete from personal.preferencias returning *");
      expect(b.rowCount).toBe(0);
    });
    await como(pool, "anon", null, async (c) => {
      await debeFallar(c, "select * from personal.preferencias", /permission denied/);
      await debeFallar(c, "select personal.guardar_preferencia('dashboard', '{}'::jsonb)", /permission denied/);
    });
    const r = await pool.query("select count(*)::int as n from personal.preferencias where user_id = $1", [MENA]);
    expect(r.rows[0].n).toBe(1);
  });

  it("las claves y el tamaño están acotados", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await debeFallar(c, "select personal.guardar_preferencia('Clave Mala', '{}'::jsonb)", /check constraint/);
      await debeFallar(c, "select personal.guardar_preferencia('dashboard', to_jsonb(repeat('x', 40000)))", /check constraint/);
    });
  });
});
