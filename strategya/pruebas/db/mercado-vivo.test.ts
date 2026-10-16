// Mercado en vivo contra Postgres real: migración, presupuesto atómico, planificador, retención, RLS,
// Realtime, horarios y las tareas de punta a punta con las muestras reales de FMP.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tareaCotizacionesFmp, tareaMovimientosAcciones } from "../../supabase/functions/_shared/fuentes/fmp.ts";
import { ErrorIngesta, type Respuesta } from "../../supabase/functions/_shared/http.ts";
import { correrTarea } from "../../supabase/functions/_shared/ingesta.ts";
import { almacenPg } from "./almacen-pg";
import { baseNueva, como, debeFallar } from "./base";

const MENA = "22222222-2222-2222-2222-222222222222";
const OTRO = "33333333-3333-3333-3333-333333333333";
const MUESTRAS = join(import.meta.dirname, "..", "muestras", "fmp");

function crudo(archivo: string, clave: string): string {
  const texto = readFileSync(join(MUESTRAS, archivo), "utf8");
  const m = new RegExp(`"${clave.replace(/[\^$.]/g, "\\$&")}":\\s*(\\[.*\\])`).exec(texto);
  if (!m) throw new Error(`falta ${clave}`);
  return m[1];
}

const SIMBOLO_A_MUESTRA: Record<string, [string, string]> = {
  "^GSPC": ["quote-short-conector-2026-10-15.json", "^GSPC"],
  "^RUT": ["quote-short-conector-2026-10-15.json", "^RUT"],
  "^N225": ["quote-short-conector-2026-10-15.json", "^N225"],
  GCUSD: ["quote-short-conector-2026-10-15.json", "GCUSD"],
  SIUSD: ["quote-short-conector-2026-10-15.json", "SIUSD"],
  BZUSD: ["quote-short-conector-2026-10-15.json", "BZUSD"],
  EURUSD: ["quote-short-conector-2026-10-15.json", "EURUSD"],
  BTCUSD: ["quote-short-conector-2026-10-15.json", "BTCUSD"],
  "^DJI": ["quote-short-conector-2026-10-15-ronda2.json", "^DJI"],
  "^IXIC": ["quote-short-conector-2026-10-15-ronda2.json", "^IXIC"],
  "^STOXX50E": ["quote-short-conector-2026-10-15-ronda2.json", "^STOXX50E"],
  "^FTSE": ["quote-short-conector-2026-10-15-ronda2.json", "^FTSE"],
  "^HSI": ["quote-short-conector-2026-10-15-ronda2.json", "^HSI"],
  USDJPY: ["quote-short-conector-2026-10-15-ronda2.json", "USDJPY"],
};

const apiFmp = async (url: string): Promise<Respuesta> => {
  const u = new URL(url);
  if (u.pathname.endsWith("biggest-gainers") || u.pathname.endsWith("biggest-losers")) {
    const clave = u.pathname.endsWith("biggest-gainers") ? "biggest-gainers" : "biggest-losers";
    return { url, status: 200, tipo: "application/json", texto: crudo("biggest-gainers-losers-conector-2026-10-15.json", clave), intentos: 1 };
  }
  const s = u.searchParams.get("symbol")!;
  const m = SIMBOLO_A_MUESTRA[s];
  if (!m) throw new ErrorIngesta(`HTTP 402 en ${url}`, url, 402);
  return { url, status: 200, tipo: "application/json", texto: crudo(m[0], m[1]), intentos: 1 };
};

let pool: pg.Pool;

beforeAll(async () => {
  pool = await baseNueva("strategya_pruebas_mercado_vivo");
  await pool.query("insert into auth.users (id, email) values ($1, 'mena@ejemplo.do'), ($2, 'otro@ejemplo.do')", [MENA, OTRO]);
  await pool.query("insert into mercado.usuarios_autorizados (user_id) values ($1)", [MENA]);
});

afterAll(async () => {
  await pool?.end();
});

describe("migración mercado_vivo", () => {
  it("marca inactivas las series que el plan de FMP niega (WTI y gas natural vuelven con FRED)", async () => {
    const { rows } = await pool.query("select id from mercado.series where not activa order by id");
    expect(rows.map((r) => r.id)).toEqual(["DXY", "IDX_GDAXI"]);
  });

  it("programa las tareas con pg_cron", async () => {
    const { rows } = await pool.query("select jobname, schedule from cron.job where jobname like 'strategya-%' order by jobname");
    const mapa = Object.fromEntries(rows.map((r) => [r.jobname, r.schedule]));
    expect(mapa).toMatchObject({
      "strategya-cotizaciones-fmp": "*/5 * * * *",
      "strategya-cotizaciones-finnhub": "*/5 13-21 * * 1-5",
      "strategya-tasas-politica": "20 22 * * 1-5",
      "strategya-movimientos-acciones": "10 14-20 * * 1-5",
      "strategya-movimientos-acciones-cierre": "20 21 * * 1-5",
      "strategya-compactar-intradia": "40 8 * * *",
    });
  });

  it("observaciones está en la publicación de Realtime", async () => {
    const { rows } = await pool.query(
      "select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'mercado' and tablename = 'observaciones'",
    );
    expect(rows).toHaveLength(1);
  });
});

describe("presupuesto de llamadas", () => {
  it("concede solo hasta el límite y es atómico con reservas simultáneas", async () => {
    const r = await Promise.all(
      Array.from({ length: 8 }, () =>
        pool.query("select mercado.reservar_llamadas('prueba', '2026-10-15', 5, 23) as n").then((x) => Number(x.rows[0].n)),
      ),
    );
    expect(r.reduce((a, b) => a + b, 0)).toBe(23);
    const { rows } = await pool.query("select llamadas from mercado.presupuesto_api where proveedor = 'prueba'");
    expect(rows[0].llamadas).toBe(23);
    const otro = await pool.query("select mercado.reservar_llamadas('prueba', '2026-10-16', 5, 23) as n");
    expect(otro.rows[0].n).toBe(5);
  });

  it("Mena no puede reservar ni escribir el presupuesto (solo service_role)", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await debeFallar(c, "select mercado.reservar_llamadas('fmp', '2026-10-15', 1, 10)", /permission denied/);
      await debeFallar(c, "insert into mercado.presupuesto_api (proveedor, dia) values ('x', '2026-10-15')", /permission denied/);
      const { rows } = await c.query("select count(*)::int as n from mercado.presupuesto_api");
      expect(rows[0].n).toBeGreaterThan(0);
    });
    await como(pool, "authenticated", OTRO, async (c) => {
      const { rows } = await c.query("select count(*)::int as n from mercado.presupuesto_api");
      expect(rows[0].n).toBe(0);
    });
  });
});

describe("cotizaciones-fmp de punta a punta", () => {
  const entorno = (n: string) => (n === "FMP_API_KEY" ? "k" : n === "FMP_LLAMADAS_DIA" ? "240" : undefined);

  it("primera corrida (jueves 11:00 NY): pide lo activo, guarda con cambio de la fuente y cuenta las llamadas", async () => {
    const r = await correrTarea(tareaCotizacionesFmp, almacenPg(pool), {
      ahora: () => new Date("2026-10-15T15:00:00Z"),
      obtener: async () => { throw new Error("no"); },
      api: apiFmp,
      entorno,
    });
    expect(r.estado).toBe("ok");
    const { rows } = await pool.query(
      "select serie_id, valor::text, cambio::text, cambio_pct::text, cambio_origen, fecha_dato::text from mercado.observaciones where fuente_id = 'fmp' order by serie_id",
    );
    expect(rows).toHaveLength(14);
    expect(rows.find((x) => x.serie_id === "IDX_SPX")).toEqual({
      serie_id: "IDX_SPX", valor: "7705.79", cambio: "-13.15", cambio_pct: "-0.17036", cambio_origen: "fuente", fecha_dato: "2026-10-15",
    });
    const pres = await pool.query("select llamadas from mercado.presupuesto_api where proveedor = 'fmp' and dia = '2026-10-15'");
    expect(pres.rows[0].llamadas).toBe(14);
  });

  it("cinco minutos después, con 240 por día, no repite todo: reparte", async () => {
    const r = await correrTarea(tareaCotizacionesFmp, almacenPg(pool), {
      ahora: () => new Date("2026-10-15T15:05:00Z"),
      obtener: async () => { throw new Error("no"); },
      api: apiFmp,
      entorno,
    });
    expect(r.estado).toBe("ok");
    expect((r.detalle.pedidas as string[]).length).toBeLessThan(14);
  });

  it("estado_planificador expone el último intento", async () => {
    const { rows } = await pool.query("select mercado.estado_planificador('fmp', 'fmp', '2026-10-15') as e");
    const e = rows[0].e;
    expect(e.series).toHaveLength(14);
    expect(e.series[0]).toMatchObject({ id: "IDX_SPX", simbolo: "^GSPC", mercado: "us_acciones" });
    expect(e.series[0].ultimo_ok).not.toBeNull();
  });

  it("Mena ve la última observación de cada serie en la vista", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      const { rows } = await c.query("select serie_id, valor::text from mercado.ultimas_obs_mercado where serie_id = 'ORO'");
      expect(rows).toEqual([{ serie_id: "ORO", valor: "4173.5" }]);
    });
    await como(pool, "authenticated", OTRO, async (c) => {
      const { rows } = await c.query("select count(*)::int as n from mercado.ultimas_obs_mercado");
      expect(rows[0].n).toBe(0);
    });
  });
});

describe("movimientos-acciones", () => {
  it("reemplaza la lista del día", async () => {
    const dep = {
      ahora: () => new Date("2026-10-15T18:10:00Z"),
      obtener: async () => { throw new Error("no"); },
      api: apiFmp,
      entorno: (n: string) => (n === "FMP_API_KEY" ? "k" : undefined),
    };
    expect((await correrTarea(tareaMovimientosAcciones, almacenPg(pool), dep)).estado).toBe("ok");
    expect((await correrTarea(tareaMovimientosAcciones, almacenPg(pool), dep)).estado).toBe("ok");
    const { rows } = await pool.query(
      "select tipo, count(*)::int as n, min(posicion) as primero from mercado.movimientos_acciones where fecha = '2026-10-15' group by tipo order by tipo",
    );
    expect(rows).toEqual([{ tipo: "baja", n: 10, primero: 1 }, { tipo: "sube", n: 10, primero: 1 }]);
    const top = await pool.query("select simbolo, precio::text, cambio_pct::text from mercado.movimientos_acciones where tipo = 'sube' and posicion = 1");
    expect(top.rows[0]).toEqual({ simbolo: "RPGL", precio: "36", cambio_pct: "132.40801" });
  });
});

describe("compactar_intradia", () => {
  it("deja todo lo de los últimos 7 días y solo el último dato de cada día anterior", async () => {
    const dias = ["20 days", "10 days", "2 days"];
    for (const d of dias) {
      for (const h of [0, 1, 2]) {
        await pool.query(
          `insert into mercado.observaciones (serie_id, valor, fecha_dato, hora_dato, fuente_id)
           values ('BTC', $1, ((now() at time zone 'utc')::date - $2::interval)::date,
                   (((now() at time zone 'utc')::date - $2::interval) + make_interval(hours => $3)) at time zone 'utc', 'fmp')`,
          [`${80000 + h}`, d, 10 + h],
        );
      }
    }
    await pool.query("select mercado.compactar_intradia()");
    const { rows } = await pool.query(
      `select ((now() at time zone 'utc')::date - fecha_dato) as edad, count(*)::int as n, max(valor)::text as valor
         from mercado.observaciones where serie_id = 'BTC' and valor >= 80000 and valor < 80003 group by 1 order by 1 desc`,
    );
    expect(rows).toEqual([
      { edad: 20, n: 1, valor: "80002" },
      { edad: 10, n: 1, valor: "80002" },
      { edad: 2, n: 3, valor: "80002" },
    ]);
  });
});
