// Módulo de noticias contra Postgres real: migración 20261016000400, agenda en UTC, ingesta de punta a punta
// (GDELT sintético, comunicados reales de la Fed y el BIS, índice real de la SEC) y RLS.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tareaGdelt } from "../../supabase/functions/_shared/fuentes/gdelt.ts";
import { TAREAS_INSTITUCIONES } from "../../supabase/functions/_shared/fuentes/rss-instituciones.ts";
import { tareaSec, urlIndiceSec } from "../../supabase/functions/_shared/fuentes/sec-edgar.ts";
import { ErrorIngesta, type Respuesta } from "../../supabase/functions/_shared/http.ts";
import { correrTarea } from "../../supabase/functions/_shared/ingesta.ts";
import { almacenPg } from "./almacen-pg";
import { baseNueva, como, debeFallar } from "./base";

const MUESTRAS = join(import.meta.dirname, "..", "muestras");
const leer = (...p: string[]) => readFileSync(join(MUESTRAS, ...p), "utf8");
const MENA = "11111111-1111-1111-1111-111111111111";
const OTRO = "22222222-2222-2222-2222-222222222222";
const ok = (url: string, texto: string): Respuesta => ({ url, status: 200, tipo: "", texto, intentos: 1 });

let pool: pg.Pool;

beforeAll(async () => {
  pool = await baseNueva("strategya_pruebas_noticias_ingesta");
  await pool.query("insert into auth.users (id, email) values ($1, 'a@ejemplo.do'), ($2, 'b@ejemplo.do')", [MENA, OTRO]);
  await pool.query("insert into mercado.usuarios_autorizados (user_id) values ($1)", [MENA]);
});

afterAll(async () => {
  await pool?.end();
});

describe("migración de noticias", () => {
  it("agenda sembrada sin confirmar, con la hora convertida a UTC (EDT→EST el 1 nov, CEST→CET el 25 oct)", async () => {
    const { rows } = await pool.query(
      `select institucion, to_char(fecha_hora at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as utc,
              to_char(fecha_hora at time zone 'America/Santo_Domingo', 'YYYY-MM-DD HH24:MI') as rd,
              confirmado, hora_conocida
         from mercado.agenda order by fecha_hora`,
    );
    expect(rows).toEqual([
      { institucion: "BoJ", utc: "2026-10-27 15:00", rd: "2026-10-27 11:00", confirmado: false, hora_conocida: false },
      { institucion: "Fed", utc: "2026-10-28 18:00", rd: "2026-10-28 14:00", confirmado: false, hora_conocida: true },
      { institucion: "BCE", utc: "2026-10-29 13:15", rd: "2026-10-29 09:15", confirmado: false, hora_conocida: true },
      { institucion: "Fed", utc: "2026-12-09 19:00", rd: "2026-12-09 15:00", confirmado: false, hora_conocida: true },
      { institucion: "BCE", utc: "2026-12-17 13:15", rd: "2026-12-17 09:15", confirmado: false, hora_conocida: true },
    ]);
  });

  it("FMI, OCDE y OFAC siguen marcadas como sin lectura automática", async () => {
    const { rows } = await pool.query("select id from mercado.fuentes where lectura_automatica = false and id in ('imf','oecd','ofac') order by id");
    expect(rows.map((r) => r.id)).toEqual(["imf", "oecd", "ofac"]);
  });

  it("programa las tareas con los nombres registrados", async () => {
    const { rows } = await pool.query("select jobname, schedule from cron.job where jobname like 'strategya-noticias%' or jobname like 'strategya-instituciones%' or jobname = 'strategya-sec-edgar' order by jobname");
    const nombres = rows.map((r) => r.jobname);
    expect(nombres).toContain("strategya-noticias-gdelt");
    expect(rows.find((r) => r.jobname === "strategya-noticias-gdelt")?.schedule).toBe("*/10 * * * *");
    expect(nombres).toContain("strategya-sec-edgar");
    for (const t of TAREAS_INSTITUCIONES) expect(nombres).toContain(`strategya-${t.nombre}`);
  });

  it("noticias, instituciones y operaciones SEC están en Realtime", async () => {
    const { rows } = await pool.query(
      "select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'mercado' order by tablename",
    );
    expect(rows.map((r) => r.tablename)).toEqual(expect.arrayContaining(["instituciones_feed", "noticias", "operaciones_sec"]));
  });
});

describe("ingesta de punta a punta", () => {
  it("GDELT: guarda titulares con categoría, país y coordenadas exactas; la segunda corrida no duplica", async () => {
    // SINTÉTICA: reemplazar por real (sondas/lotes/21-gdelt-artlist.txt).
    const muestra = leer("gdelt", "artlist-sintetica.json");
    const dep = { ahora: () => new Date("2026-10-15T00:00:05Z"), obtener: async () => ok("", ""), api: async (url: string) => ok(url, muestra) };
    const r1 = await correrTarea(tareaGdelt, almacenPg(pool), dep);
    expect(r1).toMatchObject({ estado: "ok", filas: 6 });
    const r2 = await correrTarea(tareaGdelt, almacenPg(pool), dep);
    expect(r2).toMatchObject({ estado: "ok", filas: 0 });

    const { rows } = await pool.query(
      "select categoria, pais, lat::text, lon::text, lugar, origen from mercado.noticias where titular like 'Airstrikes hit Gaza%'",
    );
    expect(rows).toEqual([{ categoria: "guerra", pais: "Palestina", lat: "31.50000", lon: "34.47000", lugar: "Gaza", origen: "gdelt" }]);
  });

  it("GDELT 429: la corrida queda «parcial» en /estado con el motivo", async () => {
    const r = await correrTarea(tareaGdelt, almacenPg(pool), {
      obtener: async () => ok("", ""),
      api: async (url) => {
        throw new ErrorIngesta(`Falló tras 3 intentos (HTTP 429): ${url}`, url);
      },
    });
    expect(r.estado).toBe("parcial");
    const { rows } = await pool.query("select estado, error from mercado.estado_tareas where tarea = 'noticias-gdelt'");
    expect(rows[0].estado).toBe("parcial");
    expect(rows[0].error).toMatch(/429/);
  });

  it("Fed (RSS real): 20 comunicados, sin duplicar en la segunda corrida", async () => {
    const fed = TAREAS_INSTITUCIONES.find((t) => t.nombre === "instituciones-fed")!;
    const dep = { obtener: async (url: string) => ok(url, leer("instituciones", "fed-press_all.xml")) };
    expect(await correrTarea(fed, almacenPg(pool), dep)).toMatchObject({ estado: "ok", filas: 20 });
    expect(await correrTarea(fed, almacenPg(pool), dep)).toMatchObject({ estado: "ok", filas: 0 });
  });

  it("BIS: solo_fecha=true se guarda", async () => {
    const bis = TAREAS_INSTITUCIONES.find((t) => t.nombre === "instituciones-bis")!;
    await correrTarea(bis, almacenPg(pool), {
      obtener: async (url) => ok(url, leer("instituciones", url.endsWith("cbspeeches.rss") ? "bis-cbspeeches.rss" : "bis-pressrels.rss")),
    });
    const { rows } = await pool.query("select count(*)::int as n, bool_and(solo_fecha) as todos from mercado.instituciones_feed where fuente_id = 'bis_rss'");
    expect(rows[0]).toEqual({ n: 40, todos: true });
  });

  it("SEC: índice real + una fila derivada de IPO → mercado.operaciones_sec, sin duplicar", async () => {
    const real = leer("sec", "form.20261014.idx.truncado");
    const fila = real.split("\n").find((l) => l.startsWith("424B2 "))!;
    // Fila DERIVADA de la real (el tramo truncado no llega a los S-1): cambia formulario, CIK y ruta.
    const derivada = "S-1".padEnd(17) + fila.slice(17, 79) + "2000001".padEnd(12) + fila.slice(91, 103) + "edgar/data/2000001/0002000001-26-000001.txt";
    const lineas = real.split("\n");
    const corte = lineas.findIndex((l) => /^-{20,}/.test(l)) + 1;
    const texto = [...lineas.slice(0, corte), derivada, ...lineas.slice(corte)].join("\n");
    const dep = {
      ahora: () => new Date("2026-10-15T15:40:00Z"),
      obtener: async (url: string) => {
        if (url === urlIndiceSec("2026-10-14")) return ok(url, texto);
        throw new ErrorIngesta(`HTTP 404 en ${url}`, url, 404);
      },
    };
    expect(await correrTarea(tareaSec, almacenPg(pool), dep)).toMatchObject({ estado: "ok", filas: 1 });
    expect(await correrTarea(tareaSec, almacenPg(pool), dep)).toMatchObject({ estado: "ok", filas: 0 });
    const { rows } = await pool.query("select form, tipo, cik, fecha::text, url from mercado.operaciones_sec");
    expect(rows).toEqual([
      {
        form: "S-1",
        tipo: "ipo",
        cik: "2000001",
        fecha: "2026-10-14",
        url: "https://www.sec.gov/Archives/edgar/data/2000001/000200000126000001/0002000001-26-000001-index.htm",
      },
    ]);
  });
});

describe("lectura con RLS", () => {
  it("Mena lee noticias, comunicados, operaciones SEC y agenda", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      for (const t of ["noticias", "instituciones_feed", "operaciones_sec", "agenda"]) {
        const { rows } = await c.query(`select count(*)::int as n from mercado.${t}`);
        expect(rows[0].n, t).toBeGreaterThan(0);
      }
    });
  });

  it("otro usuario no ve nada y nadie autenticado escribe", async () => {
    await como(pool, "authenticated", OTRO, async (c) => {
      for (const t of ["noticias", "instituciones_feed", "operaciones_sec", "agenda"]) {
        const { rows } = await c.query(`select count(*)::int as n from mercado.${t}`);
        expect(rows[0].n, t).toBe(0);
      }
    });
    await como(pool, "authenticated", MENA, async (c) => {
      await debeFallar(
        c,
        "insert into mercado.operaciones_sec (form, tipo, empresa, cik, fecha, url, archivo, indice_fecha) values ('S-1','ipo','X','1','2026-10-14','u','a','2026-10-14')",
        /permission denied|row-level security/,
      );
    });
    await como(pool, "anon", null, async (c) => {
      await debeFallar(c, "select * from mercado.operaciones_sec", /permission denied/);
    });
  });

  it("vigilar_movimientos: última observación por serie con su fuente y meta (para el mapa y «Qué vigilar»)", async () => {
    await pool.query(
      `select mercado.registrar_observaciones(null, jsonb_build_array(
         jsonb_build_object('serie_id','IDX_SPX','valor','7000.10','fecha_dato', current_date - 1),
         jsonb_build_object('serie_id','IDX_SPX','valor','7035.11','fecha_dato', current_date)))`,
    );
    await como(pool, "authenticated", MENA, async (c) => {
      const { rows } = await c.query(
        "select serie_id, valor::text, cambio::text, meta->>'lat' as lat, fuente_nombre from mercado.vigilar_movimientos where serie_id = 'IDX_SPX'",
      );
      expect(rows).toEqual([{ serie_id: "IDX_SPX", valor: "7035.11", cambio: "35.01", lat: "40.71", fuente_nombre: "Financial Modeling Prep" }]);
    });
    await como(pool, "authenticated", OTRO, async (c) => {
      const { rows } = await c.query("select * from mercado.vigilar_movimientos");
      expect(rows).toEqual([]);
    });
  });
});
