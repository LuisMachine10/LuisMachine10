// Mena Capital contra Postgres real: tablas personales, RLS, importación transaccional y la función
// que da los símbolos a la ingesta. Datos SINTÉTICOS.
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analizarArchivo, cargaParaBase } from "../../lib/capital/importar";
import { baseNueva, como, debeFallar } from "./base";

const MENA = "11111111-1111-1111-1111-111111111111";
const INTRUSO = "22222222-2222-2222-2222-222222222222";

let pool: pg.Pool;

beforeAll(async () => {
  pool = await baseNueva("strategya_pruebas_capital_esquema");
  await pool.query("insert into auth.users (id, email) values ($1, 'mena@ejemplo.do'), ($2, 'otro@ejemplo.do')", [MENA, INTRUSO]);
  await pool.query("insert into mercado.usuarios_autorizados (user_id) values ($1)", [MENA]);
});

afterAll(async () => {
  await pool?.end();
});

const ARCHIVO = JSON.stringify({
  parametros: { fx: { DOP: 1, USD: 60, EUR: 70 }, inflacion: 0.05, metaFondo: 4 },
  activos: [
    { id: "a1", clase: "ahorros", nombre: "Ahorros", inst: "Banco", moneda: "DOP", cantidad: 1000.1, precio: 1, tasa: 0.075 },
    { id: "a2", clase: "accionesusa", nombre: "ETF", simbolo: "abc", inst: "Corredor", moneda: "USD", cantidad: 2, precio: 50.5, tasa: 0 },
    { id: "a3", clase: "accionesusa", nombre: "Otra", simbolo: "XYZ", inst: "Corredor", moneda: "USD", cantidad: 1, precio: 10, tasa: 0 },
  ],
  transacciones: [{ id: "t1", activoId: "a2", simbolo: "ABC", tipo: "compra", fecha: "2026-03-02", cantidad: 2, precio: 90.5, comision: 1, moneda: "USD" }],
  cierres: { "2026-09": { ingresos: { "in-1": 50000 }, cerrado: true } },
  ips: { horizonte: "Texto", editadoPor: "mena" },
});

function carga(texto = ARCHIVO) {
  const a = analizarArchivo(texto);
  if (!a.ok) throw new Error(a.errores.join("; "));
  return JSON.stringify(cargaParaBase(a.datos));
}

describe("esquema personal de Mena Capital", () => {
  it("Mena importa todo en una transacción y las cifras quedan exactas", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      const { rows } = await c.query("select personal.importar_capital($1::jsonb) as r", [carga()]);
      expect(rows[0].r).toEqual({ parametros: 1, activos: 3, transacciones: 1, cierres: 1, ips: 1 });
      const activos = await c.query("select id, cantidad::text, simbolo, institucion, orden from personal.activos order by orden");
      expect(activos.rows).toEqual([
        { id: "a1", cantidad: "1000.1", simbolo: null, institucion: "Banco", orden: 0 },
        { id: "a2", cantidad: "2", simbolo: "ABC", institucion: "Corredor", orden: 1 },
        { id: "a3", cantidad: "1", simbolo: "XYZ", institucion: "Corredor", orden: 2 },
      ]);
      const p = await c.query("select datos from personal.parametros");
      expect(p.rows[0].datos.fx).toEqual({ USD: "60", EUR: "70" });
      expect(p.rows[0].datos.inflacion).toBe("0.05");
      const cierre = await c.query("select datos from personal.cierres where mes = '2026-09'");
      expect(cierre.rows[0].datos.ingresos).toEqual({ "in-1": "50000" });
    });
  });

  it("reimportar una sección la reemplaza completa y deja las demás intactas", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await c.query("select personal.importar_capital($1::jsonb)", [carga()]);
      await c.query("select personal.importar_capital($1::jsonb)", [carga(JSON.stringify({ activos: [{ id: "b1", clase: "efectivo", nombre: "Caja", moneda: "DOP", cantidad: 5 }] }))]);
      expect((await c.query("select id from personal.activos")).rows).toEqual([{ id: "b1" }]);
      expect((await c.query("select count(*)::int as n from personal.transacciones")).rows[0].n).toBe(1);
      expect((await c.query("select count(*)::int as n from personal.cierres")).rows[0].n).toBe(1);
    });
  });

  it("si una fila es inválida no se guarda nada (todo o nada)", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await c.query("select personal.importar_capital($1::jsonb)", [carga()]);
      const mala = JSON.stringify({ activos: [{ id: "z1", clase: "efectivo", nombre: "Ok", moneda: "DOP", cantidad: 1 }, { id: "z2", clase: "otra", nombre: "Mala", moneda: "DOP", cantidad: 1 }] });
      await debeFallar(c, "select personal.importar_capital($1::jsonb)", /check constraint/, [mala]);
      expect((await c.query("select count(*)::int as n from personal.activos")).rows[0].n).toBe(3);
    });
  });

  it("un usuario no autorizado no puede importar ni ver nada", async () => {
    await como(pool, "authenticated", INTRUSO, async (c) => {
      await debeFallar(c, "select personal.importar_capital($1::jsonb)", /No autorizado/, [carga()]);
      expect((await c.query("select count(*)::int as n from personal.activos")).rows[0].n).toBe(0);
      await debeFallar(c, "insert into personal.activos (id, clase, nombre, moneda, cantidad) values ('x', 'efectivo', 'X', 'DOP', 1)", /row-level security/);
    });
    await como(pool, "anon", null, async (c) => {
      await debeFallar(c, "select * from personal.activos", /permission denied/);
      await debeFallar(c, "select personal.importar_capital('{}'::jsonb)", /permission denied/);
    });
  });

  it("Mena edita con RLS (lo que hacen las server actions)", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await c.query(
        "insert into personal.activos (id, clase, nombre, moneda, cantidad, precio, tasa) values ('n1', 'ahorros', 'Nueva', 'DOP', '123.45', 1, '0.05')",
      );
      await c.query("update personal.activos set cantidad = '200.10' where id = 'n1'");
      expect((await c.query("select cantidad::text from personal.activos where id = 'n1'")).rows[0].cantidad).toBe("200.10");
      await c.query("insert into personal.cierres (mes, datos) values ('2026-10', '{\"cerrado\": false}')");
      await debeFallar(c, "insert into personal.cierres (mes, datos) values ('2026-13', '{}')", /check constraint/);
      await debeFallar(c, "insert into personal.parametros (id, datos) values (2, '{}')", /check constraint/);
      await c.query("delete from personal.activos where id = 'n1'");
    });
  });

  it("simbolos_cartera: solo service_role, solo renta variable y sin repetir", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await c.query("select personal.importar_capital($1::jsonb)", [carga()]);
      await c.query("insert into personal.activos (id, clase, nombre, moneda, cantidad, simbolo) values ('a4', 'rentavariable', 'Dup', 'USD', 1, 'ABC'), ('a5', 'efectivo', 'Con símbolo', 'USD', 1, 'USD')");
      await debeFallar(c, "select mercado.simbolos_cartera()", /permission denied/);
      await c.query("set local role service_role");
      expect((await c.query("select mercado.simbolos_cartera() as s")).rows[0].s).toEqual(["ABC", "XYZ"]);
    });
    await como(pool, "service_role", null, async (c) => {
      expect((await c.query("select mercado.simbolos_cartera() as s")).rows[0].s).toEqual([]);
    });
  });

  it("cotizaciones_cartera: Mena lee, solo el servidor escribe", async () => {
    await como(pool, "service_role", null, async (c) => {
      await c.query("insert into mercado.cotizaciones_cartera (simbolo, fecha, precio) values ('ABC', '2026-10-14', '101.37')");
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claim.sub', $1, true)", [MENA]);
      expect((await c.query("select precio::text from mercado.cotizaciones_cartera")).rows).toEqual([{ precio: "101.37" }]);
      await debeFallar(c, "insert into mercado.cotizaciones_cartera (simbolo, fecha, precio) values ('X', '2026-10-14', 1)", /permission denied/);
      await c.query("select set_config('request.jwt.claim.sub', $1, true)", [INTRUSO]);
      expect((await c.query("select count(*)::int as n from mercado.cotizaciones_cartera")).rows[0].n).toBe(0);
    });
  });

  it("programa la tarea de precios a las 21:30 UTC de lunes a viernes", async () => {
    const { rows } = await pool.query("select schedule, command from cron.job where jobname = 'strategya-precios-cartera'");
    expect(rows).toEqual([{ schedule: "30 21 * * 1-5", command: `select mercado.invocar_tarea('ingesta', '{"tarea":"precios-cartera"}')` }]);
  });

  it("RLS activo en todas las tablas nuevas", async () => {
    const { rows } = await pool.query(
      `select n.nspname || '.' || c.relname as tabla, c.relrowsecurity as rls
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'r' and ((n.nspname = 'personal' and c.relname not like 'caja\\_%') or c.relname = 'cotizaciones_cartera') order by 1`,
    );
    expect(rows).toEqual([
      { tabla: "mercado.cotizaciones_cartera", rls: true },
      { tabla: "personal.activos", rls: true },
      { tabla: "personal.cierres", rls: true },
      { tabla: "personal.ips", rls: true },
      { tabla: "personal.parametros", rls: true },
      { tabla: "personal.transacciones", rls: true },
    ]);
  });
});
