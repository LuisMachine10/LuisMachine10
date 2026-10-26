// Boletín por reglas contra Postgres real: migración, datos de una edición en un solo viaje, RLS de las
// ediciones con «Tu dinero», idempotencia (una por tipo y día), «Enviar prueba» y la tarea de punta a punta.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { correrTarea } from "../../supabase/functions/_shared/ingesta.ts";
import { tareaBoletinAm, tareaBoletinTasas } from "../../supabase/functions/_shared/fuentes/boletin.ts";
import { TAREAS } from "../../supabase/functions/_shared/tareas.ts";
import { almacenPg } from "./almacen-pg";
import { baseNueva, como, debeFallar } from "./base";

// Usuarios inventados para las pruebas.
const MENA = "11111111-1111-1111-1111-111111111111";
const SEGUNDO = "33333333-3333-3333-3333-333333333333"; // autorizado, pero no es el dueño
const INTRUSO = "22222222-2222-2222-2222-222222222222";
const AHORA = "2026-10-26T11:35:00Z"; // lunes 7:35 AM RD

let pool: pg.Pool;

async function obs(serie: string, valor: string, fecha: string, hora: string | null, extra: { cambio?: string; cambio_pct?: string } = {}) {
  await pool.query(
    `insert into mercado.observaciones (serie_id, valor, cambio, cambio_pct, cambio_origen, fecha_dato, hora_dato, recogido_en, fuente_id, url_dato)
     select $1, $2::numeric, $3::numeric, $4::numeric, 'fuente', $5::date, $6::timestamptz, coalesce($6::timestamptz, $5::date + 1) , s.fuente_id, null
       from mercado.series s where s.id = $1`,
    [serie, valor, extra.cambio ?? null, extra.cambio_pct ?? null, fecha, hora],
  );
}

beforeAll(async () => {
  pool = await baseNueva("strategya_pruebas_boletin");
  await pool.query("insert into auth.users (id, email) values ($1, 'mena@ejemplo.do'), ($2, 'otro@ejemplo.do'), ($3, 'segundo@ejemplo.do')", [MENA, INTRUSO, SEGUNDO]);
  await pool.query("insert into mercado.usuarios_autorizados (user_id, creado_en) values ($1, '2026-10-15'), ($2, '2026-10-20')", [MENA, SEGUNDO]);
  // Datos de mercado de ejemplo (inventados).
  await obs("IDX_SPX", "6834.72", "2026-10-23", "2026-10-23T20:00:00Z", { cambio: "81.3", cambio_pct: "1.2034" });
  await obs("ORO", "4105.3", "2026-10-26", "2026-10-26T11:30:00Z", { cambio_pct: "-2.4" });
  await obs("BRENT", "64.22", "2026-10-26", "2026-10-26T11:30:00Z", { cambio_pct: "2.9" });
  await obs("UST_10A", "4.01", "2026-10-23", null, { cambio: "0.02", cambio_pct: "0.5" });
  await obs("USDDOP_VENTA", "63.127", "2026-10-23", null, { cambio_pct: "0.05" });
  await obs("TPM_BCRD", "5.25", "2026-10-01", null, { cambio: "0" });
  // Un dato recogido después de «ahora» no debe verse.
  await pool.query(
    "insert into mercado.observaciones (serie_id, valor, fecha_dato, hora_dato, recogido_en, fuente_id) values ('PLATA', 99, '2026-10-26', '2026-10-26T12:00:00Z', '2026-10-26T12:01:00Z', 'fmp')",
  );
  await pool.query(
    "insert into mercado.noticias (titular, url, medio, fecha, categoria, hash) values ('Oil jumps on supply fears', 'https://www.reuters.com/oil', 'Reuters', '2026-10-26T09:00:00Z', 'mercado', 'h1'), ('Ceasefire talks stall', 'https://www.aljazeera.com/c', 'Al Jazeera', '2026-10-26T07:00:00Z', 'guerra', 'h2')",
  );
  await pool.query(
    "insert into mercado.fondos_rendimientos (safi, fondo, moneda, plazo_dias, rendimiento, fecha_corte, url_fuente) values ('Excel', 'Fondo Dinámico', 'DOP', 30, 7.85, '2026-10-24', 'https://fondosabiertos.excel.com.do/')",
  );
});

afterAll(async () => {
  await pool?.end();
});

describe("migración del Boletín", () => {
  it("crea las tablas con RLS y sin tablas nuevas en el esquema personal", async () => {
    const { rows } = await pool.query(
      "select relname, relrowsecurity from pg_class where relnamespace = 'mercado'::regnamespace and relkind = 'r' and relname like 'boletin%' order by relname",
    );
    expect(rows).toEqual([
      { relname: "boletin_ediciones", relrowsecurity: true },
      { relname: "boletin_pedidos", relrowsecurity: true },
      { relname: "boletin_tu_dinero", relrowsecurity: true },
    ]);
    const p = await pool.query("select count(*)::int as n from pg_class where relnamespace = 'personal'::regnamespace and relkind = 'r' and relname like '%boletin%'");
    expect(p.rows[0].n).toBe(0);
  });

  it("las tareas están registradas y programadas en UTC (hora RD + 4), con su segunda pasada", async () => {
    for (const t of ["boletin-am", "boletin-cierre", "boletin-finde", "boletin-tasas", "boletin-prueba"]) expect(TAREAS[t], t).toBeDefined();
    const { rows } = await pool.query("select jobname, schedule, command from cron.job where jobname like 'strategya-boletin%' order by jobname");
    expect(Object.fromEntries(rows.map((r) => [r.jobname, r.schedule]))).toEqual({
      "strategya-boletin-am": "35 11 * * 1-5",
      "strategya-boletin-am-reintento": "45 11 * * 1-5",
      "strategya-boletin-cierre": "5 21 * * 1-5",
      "strategya-boletin-cierre-reintento": "15 21 * * 1-5",
      "strategya-boletin-finde": "35 11 * * 0,6",
      "strategya-boletin-finde-reintento": "45 11 * * 0,6",
      "strategya-boletin-tasas": "40 10 * * 1",
      "strategya-boletin-tasas-reintento": "50 10 * * 1",
      "strategya-boletin-limpieza": "55 8 * * *",
    });
    expect(rows.find((r) => r.jobname === "strategya-boletin-am").command).toBe(`select mercado.invocar_tarea('ingesta', '{"tarea":"boletin-am"}')`);
  });
});

describe("mercado.boletin_datos", () => {
  it("trae en un viaje lo necesario, con las cifras como texto y solo lo recogido hasta «ahora»", async () => {
    await como(pool, "service_role", null, async (c) => {
      const { rows } = await c.query("select mercado.boletin_datos('am', $1) as d", [AHORA]);
      const d = rows[0].d;
      expect(d.hoy).toBe("2026-10-26");
      expect(d.viernes).toBe("2026-10-23");
      const spx = d.series.find((s: { serie_id: string }) => s.serie_id === "IDX_SPX");
      expect(spx).toMatchObject({ valor: "6834.72", cambio_pct: "1.2034", fecha_dato: "2026-10-23", fuente_nombre: "Financial Modeling Prep" });
      expect(d.series.find((s: { serie_id: string }) => s.serie_id === "PLATA")).toBeUndefined();
      expect(d.titulares.map((t: { titular: string }) => t.titular)).toEqual(["Oil jumps on supply fears", "Ceasefire talks stall"]);
      expect(d.umbrales).toContainEqual({ serie_id: "ORO", umbral: "2" });
      expect(d.fondos).toEqual([]); // los fondos solo van en la de tasas
      // «Tu dinero» va en la AM por defecto (con el Presupuesto en vivo).
      expect(d.tu_dinero).toMatchObject({ configurado: false, foto: null });
      expect(d.tu_dinero.presupuesto.mes).toBe("2026-10");
      const t = await c.query("select mercado.boletin_datos('tasas', $1) as d", [AHORA]);
      expect(t.rows[0].d.fondos[0]).toMatchObject({ safi: "Excel", rendimiento: "7.85", plazo_dias: 30 });
      expect(t.rows[0].d.tu_dinero).toBeNull();
    });
  });

  it("el dueño la usa para la vista previa (RLS); un usuario no autorizado no", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      const { rows } = await c.query("select mercado.boletin_datos('am', $1) as d", [AHORA]);
      expect(rows[0].d.series.length).toBeGreaterThan(3);
    });
    await como(pool, "authenticated", INTRUSO, async (c) => {
      await debeFallar(c, "select mercado.boletin_datos('am', now())", /No autorizado/);
    });
    await como(pool, "anon", null, async (c) => {
      await debeFallar(c, "select mercado.boletin_datos('am', now())", /permission denied/);
    });
  });

  it("respeta la preferencia «Tu dinero» de Ajustes", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await c.query(`select personal.guardar_preferencia('boletin', '{"tu_dinero": false}'::jsonb)`);
      const { rows } = await c.query("select mercado.boletin_datos('am', $1) as d", [AHORA]);
      expect(rows[0].d.tu_dinero).toBeNull();
      expect(rows[0].d.preferencias).toEqual({ tu_dinero: false });
    });
  });
});

describe("RLS de las ediciones", () => {
  beforeAll(async () => {
    await pool.query(
      `insert into mercado.boletin_ediciones (tipo, fecha, asunto, estado, con_tu_dinero, dueno) values
         ('am', '2026-10-01', 'con tu dinero', 'enviada', true, $1),
         ('tasas', '2026-10-05', 'sin tu dinero', 'enviada', false, $1)`,
      [MENA],
    );
  });

  it("la edición con «Tu dinero» solo la lee su dueño; la de mercado, cualquier autorizado", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      const r = await c.query("select asunto from mercado.boletin_ediciones where fecha < '2026-10-10' order by fecha");
      expect(r.rows.map((x) => x.asunto)).toEqual(["con tu dinero", "sin tu dinero"]);
    });
    await como(pool, "authenticated", SEGUNDO, async (c) => {
      const r = await c.query("select asunto from mercado.boletin_ediciones where fecha < '2026-10-10'");
      expect(r.rows.map((x) => x.asunto)).toEqual(["sin tu dinero"]);
    });
    await como(pool, "authenticated", INTRUSO, async (c) => {
      expect((await c.query("select * from mercado.boletin_ediciones")).rows).toHaveLength(0);
    });
  });

  it("nadie las escribe desde la app: solo el servidor", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await debeFallar(c, "insert into mercado.boletin_ediciones (tipo, fecha) values ('am', '2026-10-02')", /permission denied/);
      await debeFallar(c, "update mercado.boletin_ediciones set asunto = 'x'", /permission denied/);
      await debeFallar(c, "select mercado.boletin_reservar('am', '2026-10-02')", /permission denied/);
      await debeFallar(c, "select mercado.boletin_destino()", /permission denied/);
    });
  });

  it("una edición con «Tu dinero» siempre tiene dueño", async () => {
    await expect(pool.query("insert into mercado.boletin_ediciones (tipo, fecha, con_tu_dinero) values ('am', '2026-10-03', true)")).rejects.toThrow(/check constraint/);
  });

  it("la foto de «Tu dinero»: el dueño la guarda y la lee; otro autorizado no la ve", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await c.query(`select mercado.boletin_guardar_tu_dinero('{"mes":"2026-10","patrimonio":"100"}'::jsonb)`);
      await c.query(`select mercado.boletin_guardar_tu_dinero('{"mes":"2026-10","patrimonio":"200"}'::jsonb)`);
      const r = await c.query("select datos->>'patrimonio' as p from mercado.boletin_tu_dinero");
      expect(r.rows).toEqual([{ p: "200" }]);
    });
    await pool.query(`insert into mercado.boletin_tu_dinero (user_id, datos) values ($1, '{"mes":"2026-10","patrimonio":"300"}')`, [MENA]);
    await como(pool, "authenticated", SEGUNDO, async (c) => {
      expect((await c.query("select * from mercado.boletin_tu_dinero")).rows).toHaveLength(0);
    });
    await como(pool, "authenticated", INTRUSO, async (c) => {
      await debeFallar(c, `select mercado.boletin_guardar_tu_dinero('{}'::jsonb)`, /row-level security/);
    });
  });
});

describe("idempotencia", () => {
  it("una edición por tipo y día; si falló se puede reintentar; las pruebas van aparte", async () => {
    await como(pool, "service_role", null, async (c) => {
      const r1 = (await c.query("select mercado.boletin_reservar('cierre', '2026-10-20') as id")).rows[0].id;
      expect(r1).not.toBeNull();
      expect((await c.query("select mercado.boletin_reservar('cierre', '2026-10-20') as id")).rows[0].id).toBeNull();
      await c.query("select mercado.boletin_marcar($1, 'enviada')", [r1]);
      expect((await c.query("select mercado.boletin_reservar('cierre', '2026-10-20') as id")).rows[0].id).toBeNull();
      const r2 = (await c.query("select mercado.boletin_reservar('cierre', '2026-10-21') as id")).rows[0].id;
      await c.query("select mercado.boletin_marcar($1, 'error', 'Resend: HTTP 500')", [r2]);
      expect((await c.query("select mercado.boletin_reservar('cierre', '2026-10-21') as id")).rows[0].id).toBe(r2);
      const p1 = (await c.query("select mercado.boletin_reservar('cierre', '2026-10-20', true) as id")).rows[0].id;
      const p2 = (await c.query("select mercado.boletin_reservar('cierre', '2026-10-20', true) as id")).rows[0].id;
      expect(p1).not.toBe(p2);
      const n = await c.query("select count(*)::int as n from mercado.boletin_ediciones where tipo = 'cierre' and fecha = '2026-10-20' and not prueba");
      expect(n.rows[0].n).toBe(1);
    });
  });
});

describe("tarea de punta a punta", () => {
  it("arma con los datos de la base, guarda texto, HTML y contenido, envía una vez y no repite", async () => {
    await pool.query("delete from personal.preferencias");
    const envios: unknown[] = [];
    const dependencias = {
      obtener: () => Promise.reject(new Error("sin red")),
      api: async (url: string, o?: { cuerpo?: unknown }) => {
        envios.push(o?.cuerpo);
        return { url, status: 200, tipo: "application/json", texto: '{"id":"re_e2e"}', intentos: 1 };
      },
      entorno: (n: string) => ({ RESEND_API_KEY: "re_prueba" })[n as "RESEND_API_KEY"],
      ahora: () => new Date(AHORA),
    };
    const r1 = await correrTarea(tareaBoletinAm, almacenPg(pool), dependencias);
    expect(r1.error ?? null).toBeNull();
    expect(r1.estado).toBe("ok");
    const { rows } = await pool.query(
      "select tipo, fecha::text, estado, asunto, palabras, con_tu_dinero, dueno, resend_id, contenido->>'tipo' as t, length(html) > 1000 as html, texto like '%Fuentes:%' as texto from mercado.boletin_ediciones where tipo = 'am' and fecha = '2026-10-26'",
    );
    expect(rows).toEqual([
      {
        tipo: "am",
        fecha: "2026-10-26",
        estado: "enviada",
        asunto: "Bitácora Financiera · AM · 26 oct · Brent +2.90 %",
        palabras: expect.any(Number),
        con_tu_dinero: true,
        dueno: MENA,
        resend_id: "re_e2e",
        t: "am",
        html: true,
        texto: true,
      },
    ]);
    // El destino es el correo del dueño (el primer usuario autorizado), sacado de la base.
    expect(envios).toHaveLength(1);
    expect((envios[0] as { to: string[] }).to).toEqual(["mena@ejemplo.do"]);

    const r2 = await correrTarea(tareaBoletinAm, almacenPg(pool), dependencias);
    expect(r2.estado).toBe("ok");
    expect(envios).toHaveLength(1);
    expect((await pool.query("select count(*)::int as n from mercado.boletin_ediciones where tipo = 'am' and fecha = '2026-10-26'")).rows[0].n).toBe(1);
  });

  it("la de tasas se guarda sin «Tu dinero» y sin RESEND_API_KEY queda «sin envío» con el motivo", async () => {
    const r = await correrTarea(tareaBoletinTasas, almacenPg(pool), {
      obtener: () => Promise.reject(new Error("sin red")),
      api: () => Promise.reject(new Error("no debe llamarse")),
      entorno: () => undefined,
      ahora: () => new Date("2026-10-26T10:40:00Z"),
    });
    expect(r.estado).toBe("parcial");
    const { rows } = await pool.query("select estado, error, con_tu_dinero from mercado.boletin_ediciones where tipo = 'tasas' and fecha = '2026-10-26'");
    expect(rows).toEqual([{ estado: "sin_envio", error: expect.stringMatching(/Falta RESEND_API_KEY/), con_tu_dinero: false }]);
  });
});

describe("«Enviar prueba»", () => {
  it("solo un autorizado la pide, una cada 2 minutos, y llama a la tarea boletin-prueba", async () => {
    await como(pool, "authenticated", INTRUSO, async (c) => {
      await debeFallar(c, "select mercado.boletin_pedir_prueba('am')", /No autorizado/);
    });
    await pool.query("select mercado.configurar_tareas('https://abc.supabase.co', $1)", ["s".repeat(40)]);
    const c = await pool.connect();
    try {
      await c.query("set role authenticated");
      await c.query("select set_config('request.jwt.claim.sub', $1, false)", [MENA]);
      const r1 = (await c.query("select mercado.boletin_pedir_prueba('am') as r")).rows[0].r;
      expect(r1.ok).toBe(true);
      const r2 = (await c.query("select mercado.boletin_pedir_prueba('am') as r")).rows[0].r;
      expect(r2).toMatchObject({ ok: false, motivo: "espera" });
      await expect(c.query("select mercado.boletin_pedir_prueba('otra')")).rejects.toThrow(/Tipo de edición desconocido/);
    } finally {
      await c.query("reset role");
      c.release();
    }
    const net = await pool.query("select body from net.pedidos_simulados order by id desc limit 1");
    expect(net.rows[0].body).toEqual({ tarea: "boletin-prueba" });
    const pend = await como(pool, "service_role", null, (x) => x.query("select mercado.boletin_pedidos_pendientes() as p"));
    expect(pend.rows[0].p).toHaveLength(1);
  });
});
