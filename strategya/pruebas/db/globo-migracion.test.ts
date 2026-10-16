// Migración del globo contra Postgres real: fuentes, coordenadas, eventos_geo (RLS, retención, reemplazo
// de ciclones), series AIS y las tres tareas de punta a punta con las muestras (sintéticas) de USGS y NHC.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type AbrirSocket, crearTareaBuquesAis } from "../../supabase/functions/_shared/fuentes/buques-ais.ts";
import { CAPAS_GIS, tareaCiclonesNhc, URL_ESTADO_NHC, urlCapaGis } from "../../supabase/functions/_shared/fuentes/ciclones-nhc.ts";
import { FEEDS_USGS, tareaSismosUsgs } from "../../supabase/functions/_shared/fuentes/sismos-usgs.ts";
import { correrTarea } from "../../supabase/functions/_shared/ingesta.ts";
import { almacenPg } from "./almacen-pg";
import { baseNueva, como, debeFallar } from "./base";

const MENA = "11111111-1111-1111-1111-111111111111";
const INTRUSO = "22222222-2222-2222-2222-222222222222";
const muestra = (...p: string[]) => readFileSync(join(import.meta.dirname, "..", "muestras", ...p), "utf8");

let pool: pg.Pool;

beforeAll(async () => {
  pool = await baseNueva("strategya_pruebas_globo_migracion");
  await pool.query("insert into auth.users (id, email) values ($1, 'mena@ejemplo.do'), ($2, 'otro@ejemplo.do')", [MENA, INTRUSO]);
  await pool.query("insert into mercado.usuarios_autorizados (user_id) values ($1)", [MENA]);
});

afterAll(async () => {
  await pool?.end();
});

describe("catálogo del globo", () => {
  it("registra las fuentes usgs, nhc, aisstream y esri con notas de licencia", async () => {
    const { rows } = await pool.query("select id, requiere_clave, lectura_automatica, notas_de_uso from mercado.fuentes where id in ('usgs','nhc','aisstream','esri') order by id");
    expect(rows.map((r) => r.id)).toEqual(["aisstream", "esri", "nhc", "usgs"]);
    expect(rows.find((r) => r.id === "aisstream").requiere_clave).toBe(true);
    expect(rows.find((r) => r.id === "esri").notas_de_uso).toMatch(/Powered by Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community/);
    expect(rows.find((r) => r.id === "usgs").notas_de_uso).toMatch(/Dominio público/);
  });

  it("completa coordenadas y bolsa sin pisar otras claves de meta", async () => {
    const { rows } = await pool.query(
      "select id, meta from mercado.series where id in ('IDX_SPX','IDX_STOXX50E','ETF_SPY','ORO') order by id",
    );
    const m = Object.fromEntries(rows.map((r) => [r.id, r.meta]));
    expect(m.IDX_SPX).toMatchObject({ simbolo: "^GSPC", lat: 40.71, lon: -74.01, bolsa: "Nueva York (NYSE / Nasdaq)" });
    // Ya traía coordenadas (Fráncfort): se respetan.
    expect(m.IDX_STOXX50E).toMatchObject({ simbolo: "^STOXX50E", lat: 50.11, lon: 8.68, bolsa: "Fráncfort (Eurex / Deutsche Börse)" });
    expect(m.ETF_SPY).toMatchObject({ simbolo: "SPY", mercado: "us_acciones", lat: 40.71, lon: -74.01 });
    expect(m.ORO).not.toHaveProperty("lat");
  });

  it("crea 27 series AIS (9 pasos × buques, tanqueros, carga) con la nota de cobertura", async () => {
    const { rows } = await pool.query("select id, fuente_id, frecuencia, meta from mercado.series where id like 'AIS\\_%' order by orden");
    expect(rows).toHaveLength(27);
    expect(rows[0]).toMatchObject({ id: "AIS_ORMUZ_BUQUES", fuente_id: "aisstream", frecuencia: "intradia" });
    expect(rows[0].meta.nota).toBe("muestra de 40 s; la cobertura AIS terrestre es incompleta en alta mar");
    expect(rows[1].meta.nota).toMatch(/datos estáticos/);
  });

  it("programa las tareas con pg_cron", async () => {
    const { rows } = await pool.query("select jobname, schedule, command from cron.job where jobname like 'strategya-%' and (jobname like '%usgs' or jobname like '%nhc' or jobname like '%ais' or jobname like '%globo%') order by jobname");
    expect(rows.map((r) => [r.jobname, r.schedule])).toEqual([
      ["strategya-buques-ais", "20 * * * *"],
      ["strategya-ciclones-nhc", "7,37 * * * *"],
      ["strategya-globo-limpieza", "40 8 * * *"],
      ["strategya-sismos-usgs", "*/15 * * * *"],
    ]);
    expect(rows[3].command).toContain(`mercado.invocar_tarea('ingesta', '{"tarea":"sismos-usgs"}')`);
  });
});

describe("tareas de punta a punta", () => {
  it("sismos-usgs guarda 5 sismos y una segunda corrida no duplica", async () => {
    const dep = {
      ahora: () => new Date("2026-10-15T12:15:00Z"),
      obtener: async (url: string) => ({
        url, status: 200, tipo: "application/geo+json", intentos: 1,
        texto: url === FEEDS_USGS["4.5_day"] ? muestra("usgs", "4.5_day.geojson") : muestra("usgs", "significant_week.geojson"),
      }),
    };
    const r = await correrTarea(tareaSismosUsgs, almacenPg(pool), dep);
    expect(r.estado).toBe("ok");
    await correrTarea(tareaSismosUsgs, almacenPg(pool), dep);
    const { rows } = await pool.query("select id_externo, magnitud::text, lat::text, datos->>'profundidad_km' as prof from mercado.eventos_geo where tipo = 'sismo' order by fecha_evento desc");
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({ id_externo: "us7000r9a1", magnitud: "4.7", lat: "18.8902", prof: "35.5" });
  });

  it("globo_purgar_sismos borra los de más de 14 días", async () => {
    await pool.query(`insert into mercado.eventos_geo (tipo, id_externo, titulo, lat, lon, magnitud, fecha_evento, url, fuente_id)
      values ('sismo', 'viejo1', 'viejo', 0, 0, 5, '2026-09-25T00:00:00Z', 'https://earthquake.usgs.gov/earthquakes/eventpage/viejo1', 'usgs')`);
    const borrados = await almacenPg(pool).rpc<number>("globo_purgar_sismos", { p_dias: 14, p_ahora: "2026-10-15T12:15:00Z" });
    expect(borrados).toBe(1);
  });

  it("ciclones-nhc guarda la tormenta con su pronóstico y la borra cuando el NHC ya no la lista", async () => {
    const ahora = () => new Date("2026-10-15T09:35:00Z");
    const obtener = (estado: string) => async (url: string) => {
      if (url === URL_ESTADO_NHC) return { url, status: 200, tipo: "application/json", texto: estado, intentos: 1 };
      const i = CAPAS_GIS.findIndex((c) => url === urlCapaGis(c.id, c.tipo, c.cuenta));
      return { url, status: 200, tipo: "application/geo+json", intentos: 1, texto: muestra("nhc", ["gis-5-puntos.geojson", "gis-6-trayectoria.geojson", "gis-7-cono.geojson"][i]) };
    };
    const r1 = await correrTarea(tareaCiclonesNhc, almacenPg(pool), { ahora, obtener: obtener(muestra("nhc", "CurrentStorms.json")) });
    expect(r1).toMatchObject({ estado: "ok", detalle: { activos: 1, borrados: 0 } });
    const { rows } = await pool.query("select id_externo, titulo, magnitud::text, datos->>'geometria' as g, jsonb_array_length(datos->'puntos') as n from mercado.eventos_geo where tipo = 'ciclon'");
    expect(rows).toEqual([{ id_externo: "al142026", titulo: "Huracán Prueba", magnitud: "75", g: "vigente", n: 8 }]);

    const r2 = await correrTarea(tareaCiclonesNhc, almacenPg(pool), { ahora, obtener: obtener(muestra("nhc", "CurrentStorms-sin-tormentas.json")) });
    expect(r2).toMatchObject({ estado: "ok", detalle: { activos: 0, borrados: 1 } });
    const { rowCount } = await pool.query("select 1 from mercado.eventos_geo where tipo = 'ciclon'");
    expect(rowCount).toBe(0);
    // Los sismos no se tocan al reemplazar ciclones.
    const sismos = await pool.query("select count(*)::int as n from mercado.eventos_geo where tipo = 'sismo'");
    expect(sismos.rows[0].n).toBe(5);
  });

  it("buques-ais registra solo conteos (sin MMSI ni nombres en la base)", async () => {
    const marcos = muestra("aisstream", "mensajes.jsonl").split("\n").filter((l) => l && !l.startsWith("//"));
    const abrir: AbrirSocket = (_url, ev) => {
      queueMicrotask(() => {
        ev.alAbrir();
        for (const m of marcos) ev.alMensaje(m);
      });
      return { enviar: () => {}, cerrar: () => {} };
    };
    const r = await correrTarea(crearTareaBuquesAis(abrir, 5), almacenPg(pool), {
      ahora: () => new Date("2026-10-15T12:20:00Z"),
      obtener: async () => { throw new Error("sin red"); },
      entorno: (n) => ({ GLOBO_AIS_ACTIVO: "1", AISSTREAM_API_KEY: "k" })[n],
    });
    expect(r.estado).toBe("ok");
    const { rows } = await pool.query("select serie_id, valor::text from mercado.observaciones where serie_id like 'AIS\\_ORMUZ%' order by serie_id");
    expect(rows).toEqual([
      { serie_id: "AIS_ORMUZ_BUQUES", valor: "3" },
      { serie_id: "AIS_ORMUZ_CARGA", valor: "1" },
      { serie_id: "AIS_ORMUZ_TANQUEROS", valor: "1" },
    ]);
    const todo = await pool.query("select (select coalesce(string_agg(detalle::text, ' '), '') from mercado.corridas) || (select coalesce(string_agg(url_dato, ' '), '') from mercado.observaciones) as t");
    expect(todo.rows[0].t).not.toMatch(/538000001|SINTETICO/);
  });
});

describe("RLS de eventos_geo", () => {
  it("Mena lee; otro usuario autenticado no ve nada; anon no tiene acceso", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      const { rows } = await c.query("select count(*)::int as n from mercado.eventos_geo");
      expect(rows[0].n).toBeGreaterThan(0);
    });
    await como(pool, "authenticated", INTRUSO, async (c) => {
      const { rows } = await c.query("select count(*)::int as n from mercado.eventos_geo");
      expect(rows[0].n).toBe(0);
    });
    await como(pool, "anon", null, async (c) => {
      await debeFallar(c, "select * from mercado.eventos_geo", /permission denied/);
    });
  });

  it("ni Mena puede escribir eventos ni llamar las funciones del globo", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      await debeFallar(
        c,
        "insert into mercado.eventos_geo (tipo, id_externo, titulo, lat, lon, fecha_evento, url) values ('sismo','x','x',0,0,now(),'https://x')",
        /permission denied/,
      );
      await debeFallar(c, "select mercado.globo_purgar_sismos(1)", /permission denied/);
      await debeFallar(c, "select mercado.globo_reemplazar_ciclones('[]'::jsonb)", /permission denied/);
    });
  });

  it("restricciones: tipo, coordenadas y enlace https", async () => {
    await como(pool, "service_role", null, async (c) => {
      const base = "insert into mercado.eventos_geo (tipo, id_externo, titulo, lat, lon, fecha_evento, url) values ";
      await debeFallar(c, `${base}('volcan','a','a',0,0,now(),'https://x')`, /check/);
      await debeFallar(c, `${base}('sismo','b','b',91,0,now(),'https://x')`, /check/);
      await debeFallar(c, `${base}('sismo','c','c',0,0,now(),'http://x')`, /check/);
    });
  });

  it("está en la publicación de Realtime", async () => {
    const { rows } = await pool.query("select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'mercado' and tablename = 'eventos_geo'");
    expect(rows).toHaveLength(1);
  });
});
