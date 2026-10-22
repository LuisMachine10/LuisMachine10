// Mi lista y Mis posiciones contra Postgres real: tabla personal.watchlist (formato y RLS), símbolos para
// la ingesta (lista + Renta Variable, sin los «no publica» de las últimas 24 h), horario, y la tarea
// cotizaciones-lista de punta a punta con las muestras REALES de Cboe (SPY y GLD, 16 oct 2026).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tareaCotizacionesLista } from "../../supabase/functions/_shared/fuentes/cotizaciones-lista.ts";
import { ErrorIngesta, type Respuesta } from "../../supabase/functions/_shared/http.ts";
import { correrTarea } from "../../supabase/functions/_shared/ingesta.ts";
import { almacenPg } from "./almacen-pg";
import { baseNueva, debeFallar } from "./base";

const M = (n: string) => readFileSync(join(import.meta.dirname, "..", "muestras", "cboe", n), "utf8");
const ok = (url: string, texto: string): Respuesta => ({ url, status: 200, tipo: "application/json", texto, intentos: 1 });
const DUENO = "22222222-2222-2222-2222-222222222222";
const OTRO = "33333333-3333-3333-3333-333333333333";

let pool: pg.Pool;
beforeAll(async () => {
  pool = await baseNueva("strategya_pruebas_mercado_lista");
  await pool.query("insert into auth.users (id, email) values ($1, 'dueno@ejemplo.do'), ($2, 'otro@ejemplo.do')", [DUENO, OTRO]);
  await pool.query("insert into mercado.usuarios_autorizados (user_id) values ($1)", [DUENO]);
});
afterAll(async () => {
  await pool?.end();
});

async function comoUsuario<T>(uid: string, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
    await c.query("set local role authenticated");
    const r = await fn(c);
    await c.query("rollback");
    return r;
  } finally {
    c.release();
  }
}

describe("migración", () => {
  it("formato del símbolo, RLS y horario", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await debeFallar(c, "insert into personal.watchlist (simbolo) values ('aapl')", /watchlist_simbolo_check/);
      await debeFallar(c, "insert into personal.watchlist (simbolo) values ('TOOLONG')", /watchlist_simbolo_check/);
      await debeFallar(c, "insert into personal.watchlist (simbolo) values ('BTC1')", /watchlist_simbolo_check/);
      await c.query("insert into personal.watchlist (simbolo) values ('BRK.B')");
      await c.query("rollback");
    } finally {
      c.release();
    }
    const job = await pool.query("select schedule from cron.job where jobname = 'strategya-cotizaciones-lista'");
    expect(job.rows).toEqual([{ schedule: "*/5 13-21 * * 1-5" }]);
  });

  it("solo el autorizado lee y escribe su lista", async () => {
    const delDueno = await comoUsuario(DUENO, async (c) => {
      await c.query("insert into personal.watchlist (simbolo, nota, orden) values ('AAPL', 'nota', 1)");
      return (await c.query("select simbolo from personal.watchlist")).rows;
    });
    expect(delDueno).toEqual([{ simbolo: "AAPL" }]);
    const delOtro = await comoUsuario(OTRO, async (c) => {
      await debeFallar(c, "insert into personal.watchlist (simbolo) values ('MSFT')", /row-level security/);
      return (await c.query("select count(*)::int as n from personal.watchlist")).rows[0].n;
    });
    expect(delOtro).toBe(0);
  });

  it("la ingesta no puede llamar a simbolos_lista como usuario", async () => {
    await comoUsuario(DUENO, (c) => debeFallar(c, "select mercado.simbolos_lista()", /permission denied/));
  });
});

describe("cotizaciones-lista de punta a punta", () => {
  it("lee lista + Renta Variable, guarda con fuente cboe, marca el 404 y no lo vuelve a pedir en 24 h", async () => {
    await pool.query("insert into personal.watchlist (simbolo, orden) values ('SPY', 1), ('NOHAY', 2)");
    await pool.query(
      "insert into personal.activos (id, clase, nombre, moneda, cantidad, simbolo) values ('x1', 'rentavariable', 'Ejemplo', 'USD', 2, 'GLD'), ('x2', 'rentafija', 'Bono', 'DOP', 1, null)",
    );
    const lista = (await pool.query("select mercado.simbolos_lista() as r")).rows[0].r;
    expect(lista).toEqual({ simbolos: ["GLD", "NOHAY", "SPY"], omitidos: [], ultimo_ok: null });

    const pedidas: string[] = [];
    const deps = {
      ahora: () => new Date("2026-10-16T19:00:00Z"),
      obtener: async (url: string) => {
        pedidas.push(url.split("/").at(-1)!);
        if (url.endsWith("/SPY.json")) return ok(url, M("quote-SPY-real-2026-10-16.json"));
        if (url.endsWith("/GLD.json")) return ok(url, M("quote-GLD-real-2026-10-16.json"));
        throw new ErrorIngesta("HTTP 404", url, 404);
      },
      entorno: () => undefined,
    };
    const r = await correrTarea(tareaCotizacionesLista, almacenPg(pool), deps);
    expect(r.estado).toBe("parcial");
    const filas = await pool.query(
      "select simbolo, fecha::text, precio::text, cierre_anterior::text, cambio::text, maximo::text, minimo::text, fuente from mercado.cotizaciones_cartera order by simbolo",
    );
    expect(filas.rows).toEqual([
      { simbolo: "GLD", fecha: "2026-10-16", precio: "381.9", cierre_anterior: "382.71", cambio: "-0.7", maximo: "384.88", minimo: "380.9", fuente: "cboe" },
      { simbolo: "SPY", fecha: "2026-10-16", precio: "762.69", cierre_anterior: "771.79", cambio: "-8.56", maximo: "773.25", minimo: "760.64", fuente: "cboe" },
    ]);
    const marca = await pool.query("select simbolo, fuente, motivo from mercado.simbolos_sin_cotizacion");
    expect(marca.rows).toEqual([{ simbolo: "NOHAY", fuente: "cboe", motivo: "Cboe no publica este símbolo" }]);

    // La función ya no lo entrega (marcado hace menos de 24 h) y el resto ya tiene lectura.
    await pool.query("update mercado.simbolos_sin_cotizacion set marcado_en = now()");
    const despues = (await pool.query("select mercado.simbolos_lista() as r")).rows[0].r;
    expect(despues.simbolos).toEqual(["GLD", "SPY"]);
    expect(despues.omitidos).toEqual(["NOHAY"]);
    expect(despues.ultimo_ok).not.toBeNull();

    // Pasadas 24 h vuelve a la lista.
    await pool.query("update mercado.simbolos_sin_cotizacion set marcado_en = now() - interval '25 hours'");
    expect((await pool.query("select mercado.simbolos_lista() as r")).rows[0].r.simbolos).toEqual(["GLD", "NOHAY", "SPY"]);

    // El usuario autorizado lee las cotizaciones y las marcas.
    const leido = await comoUsuario(DUENO, async (c) => (await c.query("select count(*)::int as n from mercado.simbolos_sin_cotizacion")).rows[0].n);
    expect(leido).toBe(1);
  });
});
