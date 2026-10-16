// Respaldo gratuito de cotizaciones contra Postgres real: fuente por fila, series nuevas, horarios y la
// tarea de Cboe de punta a punta con las muestras reales del 16 oct 2026.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tareaCotizacionesCboe, URL_INDICES_CBOE } from "../../supabase/functions/_shared/fuentes/cboe.ts";
import { tareaDivisasBce } from "../../supabase/functions/_shared/fuentes/ecb-fx.ts";
import type { Respuesta } from "../../supabase/functions/_shared/http.ts";
import { correrTarea } from "../../supabase/functions/_shared/ingesta.ts";
import { almacenPg } from "./almacen-pg";
import { baseNueva } from "./base";

const M = (...p: string[]) => readFileSync(join(import.meta.dirname, "..", "muestras", ...p), "utf8");
const ok = (url: string, texto: string): Respuesta => ({ url, status: 200, tipo: "application/json", texto, intentos: 1 });

let pool: pg.Pool;
beforeAll(async () => {
  pool = await baseNueva("strategya_pruebas_respaldo_mercado");
});
afterAll(async () => {
  await pool?.end();
});

describe("migración", () => {
  it("fuentes, series nuevas, WTI y gas natural de FRED, y horarios", async () => {
    const f = await pool.query("select id from mercado.fuentes where id = any($1) order by id", [
      ["cboe", "bce_fx", "fred", "wsj_rss", "cnbc_rss", "ft_rss", "bloomberglinea_rss", "eleconomista_rss", "expansion_rss"],
    ]);
    expect(f.rowCount).toBe(9);
    const s = await pool.query("select id, fuente_id, activa, frecuencia from mercado.series where id in ('IDX_NDX','IDX_VIX','WTI','GAS_NATURAL') order by id");
    expect(s.rows).toEqual([
      { id: "GAS_NATURAL", fuente_id: "fred", activa: true, frecuencia: "diaria" },
      { id: "IDX_NDX", fuente_id: "cboe", activa: true, frecuencia: "intradia" },
      { id: "IDX_VIX", fuente_id: "cboe", activa: true, frecuencia: "intradia" },
      { id: "WTI", fuente_id: "fred", activa: true, frecuencia: "diaria" },
    ]);
    const c = await pool.query("select jobname from cron.job where jobname in ('strategya-cotizaciones-cboe','strategya-divisas-bce','strategya-cierres-fred') order by 1");
    expect(c.rows.map((r) => r.jobname)).toEqual(["strategya-cierres-fred", "strategya-cotizaciones-cboe", "strategya-divisas-bce"]);
  });
});

describe("registrar_observaciones con fuente por fila", () => {
  it("usa la fuente de la fila; sin ella, la de la serie; y la actualiza si cambia", async () => {
    const filas = [
      { serie_id: "EURUSD", valor: "1.1253", fecha_dato: "2026-10-01", hora_dato: "2026-10-01T12:15:00Z", fuente_id: "bce_fx" },
      { serie_id: "EURUSD", valor: "1.1260", fecha_dato: "2026-10-02", hora_dato: "2026-10-02T12:15:00Z" },
    ];
    await pool.query("select * from mercado.registrar_observaciones(null, $1)", [JSON.stringify(filas)]);
    const r = await pool.query("select fecha_dato::text, fuente_id from mercado.observaciones where serie_id = 'EURUSD' order by fecha_dato");
    expect(r.rows).toEqual([{ fecha_dato: "2026-10-01", fuente_id: "bce_fx" }, { fecha_dato: "2026-10-02", fuente_id: "fmp" }]);
    const misma = [{ ...filas[1], fuente_id: "bce_fx" }];
    const [conteo] = (await pool.query("select * from mercado.registrar_observaciones(null, $1)", [JSON.stringify(misma)])).rows;
    expect(conteo).toMatchObject({ insertadas: 0, actualizadas: 1 });
  });

  it("una fuente desconocida se rechaza", async () => {
    await expect(
      pool.query("select * from mercado.registrar_observaciones(null, $1)", [
        JSON.stringify([{ serie_id: "EURUSD", valor: "1", fecha_dato: "2026-10-03", fuente_id: "inventada" }]),
      ]),
    ).rejects.toThrow(/Fuente desconocida: inventada/);
  });
});

describe("tareas de punta a punta", () => {
  it("Cboe sin claves: índices y ETF con su fuente, y el sello en la vista", async () => {
    const indices = M("cboe", "all_us_indices-recorte-real-2026-10-16.json");
    const spy = M("cboe", "quote-SPY-real-2026-10-16.json");
    const r = await correrTarea(tareaCotizacionesCboe, almacenPg(pool), {
      ahora: () => new Date("2026-10-16T19:00:00Z"),
      obtener: async (url) => ok(url, url === URL_INDICES_CBOE ? indices : spy),
      entorno: () => undefined,
    });
    expect(r.estado).toBe("ok");
    const v = await pool.query("select serie_id, valor::text, fuente_id from mercado.ultimas_obs_mercado where serie_id in ('IDX_SPX','IDX_VIX','ETF_SPY') order by serie_id");
    expect(v.rows).toEqual([
      { serie_id: "ETF_SPY", valor: "762.69", fuente_id: "cboe" },
      { serie_id: "IDX_SPX", valor: "7659.4199", fuente_id: "cboe" },
      { serie_id: "IDX_VIX", valor: "20.09", fuente_id: "cboe" },
    ]);
  });

  it("BCE: EUR/USD y USD/JPY con fuente bce_fx", async () => {
    const r = await correrTarea(tareaDivisasBce, almacenPg(pool), {
      obtener: async (url) => ok(url, M("bce-fx", "eurofxref-daily-real-2026-10-16.xml")),
      entorno: () => undefined,
    });
    expect(r.estado).toBe("ok");
    const v = await pool.query("select serie_id, valor::text, fuente_id from mercado.ultimas_obs_mercado where serie_id in ('EURUSD','USDJPY') order by serie_id");
    expect(v.rows).toEqual([
      { serie_id: "EURUSD", valor: "1.1253", fuente_id: "bce_fx" },
      { serie_id: "USDJPY", valor: "158.0201", fuente_id: "bce_fx" },
    ]);
  });
});
