import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { baseNueva, como, debeFallar } from "./base";

const MENA = "11111111-1111-1111-1111-111111111111";
const INTRUSO = "22222222-2222-2222-2222-222222222222";

let pool: pg.Pool;

beforeAll(async () => {
  pool = await baseNueva("strategya_pruebas_esquema");
  await pool.query("insert into auth.users (id, email) values ($1, 'mena@ejemplo.do'), ($2, 'otro@ejemplo.do')", [MENA, INTRUSO]);
  await pool.query("insert into mercado.usuarios_autorizados (user_id) values ($1)", [MENA]);
});

afterAll(async () => {
  await pool?.end();
});

type Fila = { serie_id: string; valor: string; fecha_dato: string; hora_dato?: string; cambio?: string; url_dato?: string };

async function registrar(c: pg.PoolClient, filas: Fila[]) {
  const { rows } = await c.query("select * from mercado.registrar_observaciones(null, $1::jsonb)", [JSON.stringify(filas)]);
  return rows[0] as { recibidas: number; insertadas: number; actualizadas: number };
}

async function leer(c: pg.PoolClient, serie: string) {
  const { rows } = await c.query(
    "select fecha_dato::text, valor::text, cambio::text, cambio_pct::text, cambio_origen from mercado.observaciones where serie_id = $1 order by fecha_dato",
    [serie],
  );
  return rows;
}

describe("registrar_observaciones", () => {
  it("inserta, calcula el cambio diario con decimales exactos y es idempotente", async () => {
    await como(pool, "service_role", null, async (c) => {
      const filas: Fila[] = [
        { serie_id: "UST_10A", valor: "5.24", fecha_dato: "2026-10-01" },
        { serie_id: "UST_10A", valor: "5.19", fecha_dato: "2026-10-02" },
      ];
      expect(await registrar(c, filas)).toEqual({ recibidas: 2, insertadas: 2, actualizadas: 0 });
      expect(await leer(c, "UST_10A")).toEqual([
        { fecha_dato: "2026-10-01", valor: "5.24", cambio: null, cambio_pct: null, cambio_origen: "calculado" },
        { fecha_dato: "2026-10-02", valor: "5.19", cambio: "-0.05", cambio_pct: "-0.954198", cambio_origen: "calculado" },
      ]);
      // Misma entrada otra vez: nada cambia.
      expect(await registrar(c, filas)).toEqual({ recibidas: 2, insertadas: 0, actualizadas: 0 });
    });
  });

  it("acepta registros fuera de orden y recalcula cuando la fuente revisa un valor", async () => {
    await como(pool, "service_role", null, async (c) => {
      await registrar(c, [{ serie_id: "UST_2A", valor: "4.83", fecha_dato: "2026-10-02" }]);
      await registrar(c, [{ serie_id: "UST_2A", valor: "4.78", fecha_dato: "2026-10-01" }]);
      expect((await leer(c, "UST_2A"))[1]).toMatchObject({ cambio: "0.05" });

      const r = await registrar(c, [{ serie_id: "UST_2A", valor: "4.80", fecha_dato: "2026-10-01" }]);
      expect(r).toEqual({ recibidas: 1, insertadas: 0, actualizadas: 1 });
      expect((await leer(c, "UST_2A"))[1]).toMatchObject({ valor: "4.83", cambio: "0.03" });
    });
  });

  it("no pierde precisión: el valor se guarda tal cual vino en texto", async () => {
    await como(pool, "service_role", null, async (c) => {
      await registrar(c, [{ serie_id: "UST_30A", valor: "61.539612345678901234567", fecha_dato: "2026-10-01" }]);
      expect((await leer(c, "UST_30A"))[0].valor).toBe("61.539612345678901234567");
    });
  });

  it("respeta el cambio que publica la fuente y no lo recalcula", async () => {
    await como(pool, "service_role", null, async (c) => {
      await registrar(c, [
        { serie_id: "UST_5A", valor: "5.01", fecha_dato: "2026-10-01" },
        { serie_id: "UST_5A", valor: "5.06", fecha_dato: "2026-10-02", cambio: "0.07" },
      ]);
      expect((await leer(c, "UST_5A"))[1]).toMatchObject({ cambio: "0.07", cambio_origen: "fuente" });
    });
  });

  it("si una clave viene repetida en el mismo lote, gana la última", async () => {
    await como(pool, "service_role", null, async (c) => {
      const r = await registrar(c, [
        { serie_id: "UST_7A", valor: "5.10", fecha_dato: "2026-10-01" },
        { serie_id: "UST_7A", valor: "5.12", fecha_dato: "2026-10-01" },
      ]);
      expect(r).toEqual({ recibidas: 1, insertadas: 1, actualizadas: 0 });
      expect((await leer(c, "UST_7A"))[0].valor).toBe("5.12");
    });
  });

  it("rechaza una serie que no existe en el catálogo", async () => {
    await como(pool, "service_role", null, async (c) => {
      await expect(registrar(c, [{ serie_id: "INVENTADA", valor: "1", fecha_dato: "2026-10-01" }])).rejects.toThrow(
        /Serie desconocida: INVENTADA/,
      );
    });
  });

  it("solo service_role puede registrar", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await expect(registrar(c, [{ serie_id: "UST_1M", valor: "4", fecha_dato: "2026-10-01" }])).rejects.toThrow(
        /permission denied/,
      );
    });
  });
});

describe("RLS · un solo dueño", () => {
  beforeAll(async () => {
    await pool.query(
      "insert into mercado.observaciones (serie_id, valor, fecha_dato, fuente_id) values ('UST_3M', 4.17, '2026-10-01', 'tesoro_eeuu')",
    );
  });

  it("Mena lee observaciones y catálogo", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      const { rows } = await c.query("select valor::text from mercado.observaciones where serie_id = 'UST_3M'");
      expect(rows).toEqual([{ valor: "4.17" }]);
      const series = await c.query("select count(*)::int as n from mercado.series where fuente_id = 'tesoro_eeuu'");
      expect(series.rows[0].n).toBe(14);
    });
  });

  it("otro usuario con sesión no ve nada", async () => {
    await como(pool, "authenticated", INTRUSO, async (c) => {
      const { rows } = await c.query("select * from mercado.observaciones");
      expect(rows).toEqual([]);
      const series = await c.query("select * from mercado.series");
      expect(series.rows).toEqual([]);
    });
  });

  it("anon no tiene acceso al esquema", async () => {
    await como(pool, "anon", null, async (c) => {
      await expect(c.query("select * from mercado.observaciones")).rejects.toThrow(/permission denied/);
    });
  });

  it("Mena no puede escribir datos de mercado, pero sí cargar datos manuales", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await debeFallar(
        c,
        "insert into mercado.observaciones (serie_id, valor, fecha_dato, fuente_id) values ('UST_3M', 1, '2026-10-02', 'tesoro_eeuu')",
        /permission denied/,
      );
      await debeFallar(c, "update mercado.series set nombre = 'x'", /permission denied/);
      await debeFallar(c, "insert into mercado.usuarios_autorizados (user_id) values ($1)", /permission denied/, [INTRUSO]);
      const r = await c.query(
        "insert into mercado.carga_manual (dato, valor, fecha, nota) values ('Fondo BHD Liquidez · 30 días', 9.12, '2026-10-14', 'prueba') returning creado_por",
      );
      expect(r.rows[0].creado_por).toBe(MENA);
    });
  });

  it("un usuario no autorizado no puede cargar datos manuales", async () => {
    await como(pool, "authenticated", INTRUSO, async (c) => {
      await expect(
        c.query("insert into mercado.carga_manual (dato, valor, fecha) values ('x', 1, '2026-10-14')"),
      ).rejects.toThrow(/row-level security/);
    });
  });
});

describe("tareas programadas", () => {
  it("deja programadas las corridas del Tesoro y la limpieza", async () => {
    const { rows } = await pool.query(
      "select jobname, schedule from cron.job where jobname in ('strategya-limpieza', 'strategya-tesoro-manana', 'strategya-tesoro-noche', 'strategya-tesoro-tarde') order by jobname",
    );
    expect(rows).toEqual([
      { jobname: "strategya-limpieza", schedule: "30 8 * * *" },
      { jobname: "strategya-tesoro-manana", schedule: "0 11 * * 1-6" },
      { jobname: "strategya-tesoro-noche", schedule: "45 23 * * 1-5" },
      { jobname: "strategya-tesoro-tarde", schedule: "15 22 * * 1-5" },
    ]);
  });

  it("sin secretos en Vault, invocar_tarea deja una corrida con error visible en /estado", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      const r = await c.query(`select mercado.invocar_tarea('ingesta', '{"tarea":"tesoro"}') as id`);
      expect(r.rows[0].id).toBeNull();
      const e = await c.query("select tarea, estado, error from mercado.estado_tareas");
      expect(e.rows[0]).toMatchObject({ tarea: "tesoro", estado: "error" });
      expect(e.rows[0].error).toMatch(/faltan los secretos/);
    } finally {
      await c.query("rollback");
      c.release();
    }
  });

  it("con secretos, llama a la Edge Function con el encabezado secreto", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await expect(c.query("select mercado.configurar_tareas('https://abc.supabase.co/', 'corto')")).rejects.toThrow(
        /URL de proyecto inválida/,
      );
      await c.query("rollback");
      await c.query("begin");
      const secreto = "s".repeat(40);
      await c.query("select mercado.configurar_tareas('https://abc.supabase.co', $1)", [secreto]);
      await c.query("select mercado.configurar_tareas('https://abc.supabase.co', $1)", [secreto]); // idempotente
      await c.query(`select mercado.invocar_tarea('ingesta', '{"tarea":"tesoro"}')`);
      const { rows } = await c.query("select url, headers, body from net.pedidos_simulados");
      expect(rows).toHaveLength(1);
      expect(rows[0].url).toBe("https://abc.supabase.co/functions/v1/ingesta");
      expect(rows[0].body).toEqual({ tarea: "tesoro" });
      expect(rows[0].headers["x-strategya-secreto"]).toBe(secreto);
      await expect(c.query("select mercado.invocar_tarea('../otra')")).rejects.toThrow(/inválido/);
    } finally {
      await c.query("rollback");
      c.release();
    }
  });

  it("Mena no puede leer ni cambiar los secretos", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await expect(c.query("select mercado.configurar_tareas('https://x.supabase.co', $1)", ["s".repeat(40)])).rejects.toThrow(
        /permission denied/,
      );
    });
  });
});
