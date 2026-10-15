// Punta a punta sin red: muestras reales de BCRD, Crédito Público, SIMV y MICM → tareas →
// Postgres con todas las migraciones → lo que ve Mena con RLS.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  crearTareaBcrdExcel,
  CUADROS_TASAS,
  tareaBcrdPortada,
  URL_DOLAR_XLSX,
  URL_TPM_XLSX,
  urlMonetario,
} from "../../supabase/functions/_shared/fuentes/bcrd.ts";
import { tareaCreditoPublico } from "../../supabase/functions/_shared/fuentes/credito-publico.ts";
import { tareaMicm } from "../../supabase/functions/_shared/fuentes/micm.ts";
import { tareaSimv } from "../../supabase/functions/_shared/fuentes/simv.ts";
import { correrTarea } from "../../supabase/functions/_shared/ingesta.ts";
import { TAREAS } from "../../supabase/functions/_shared/tareas.ts";
import { almacenPg } from "./almacen-pg";
import { baseNueva, como } from "./base";

const M = join(import.meta.dirname, "..", "muestras");
const texto = (ruta: string) => readFileSync(join(M, ruta), "utf8");
const MENA = "11111111-1111-1111-1111-111111111111";
const INTRUSO = "22222222-2222-2222-2222-222222222222";
const ahora = () => new Date("2026-10-15T14:00:00Z");

const ARCHIVOS: Record<string, string> = {
  [URL_DOLAR_XLSX]: "TASA_DOLAR_REFERENCIA_MC.xlsx",
  [URL_TPM_XLSX]: "Serie_TPM.xlsx",
  ...Object.fromEntries(CUADROS_TASAS.map((c) => [urlMonetario(c.archivo), c.archivo])),
};
const tareaExcel = crearTareaBcrdExcel(() => async (url) => new Uint8Array(readFileSync(join(M, "bcrd", ARCHIVOS[url]))));

const respuesta = (cuerpo: string) => async (url: string) => ({ url, status: 200, tipo: "text/html", texto: cuerpo, intentos: 1 });

let pool: pg.Pool;

beforeAll(async () => {
  pool = await baseNueva("strategya_pruebas_rd_ingesta");
  await pool.query("insert into auth.users (id, email) values ($1, 'mena@ejemplo.do'), ($2, 'otro@ejemplo.do')", [MENA, INTRUSO]);
  await pool.query("insert into mercado.usuarios_autorizados (user_id) values ($1)", [MENA]);
});

afterAll(async () => {
  await pool?.end();
});

async function ultimo(serie: string) {
  const { rows } = await pool.query(
    `select fecha_dato::text, valor::text, cambio::text, fuente_id, url_dato
       from mercado.observaciones where serie_id = $1 order by fecha_dato desc limit 1`,
    [serie],
  );
  return rows[0];
}

describe("catálogo y horarios del módulo RD", () => {
  it("las 5 tareas están registradas y programadas en UTC", async () => {
    for (const t of ["bcrd-portada", "bcrd-excel", "credito-publico", "simv", "micm"]) expect(TAREAS[t]).toBeDefined();
    const { rows } = await pool.query("select jobname, schedule from cron.job where jobname like 'strategya-%' order by jobname");
    const horarios = Object.fromEntries(rows.map((r) => [r.jobname, r.schedule]));
    expect(horarios).toMatchObject({
      "strategya-bcrd-portada-manana": "0 13 * * *",
      "strategya-bcrd-portada-tarde": "0 20 * * *",
      "strategya-bcrd-excel": "0 14 * * 1-5",
      "strategya-credito-publico": "15 15 * * *",
      "strategya-simv": "45 15 * * *",
      "strategya-micm-viernes": "30 23 * * 5",
      "strategya-micm-sabado": "30 13 * * 6",
    });
  });

  it("toda serie que escriben los parsers existe en el catálogo", async () => {
    const { rows } = await pool.query("select id from mercado.series where id like 'TASA_ACT_%' or id like 'TASA_PAS_%' or id like 'COMB_%'");
    expect(rows.length).toBe(31);
  });
});

describe("ingesta RD de punta a punta", () => {
  it("bcrd-excel: historial del dólar, TPM y 23 series de tasas", async () => {
    const r = await correrTarea(tareaExcel, almacenPg(pool), { ahora, obtener: () => Promise.reject(new Error("no se usa")) });
    expect(r.estado).toBe("ok");
    expect(await ultimo("USDDOP_VENTA")).toMatchObject({ fecha_dato: "2026-10-13", valor: "61.5396", fuente_id: "bcrd" });
    expect(await ultimo("TPM_BCRD")).toMatchObject({ fecha_dato: "2026-10-01", valor: "5.5", cambio: "0.25", fuente_id: "bcrd_excel" });
    expect(await ultimo("TASA_ACT_MN_TARJETA")).toMatchObject({ fecha_dato: "2026-08-31", valor: "58.3295" });
    expect(await ultimo("TASA_PAS_MN_30D")).toMatchObject({ fecha_dato: "2026-08-31", valor: "7.5683" });
  });

  it("bcrd-portada: el dólar del 14 oct entra después del Excel y su cambio diario sale de los dos valores oficiales", async () => {
    const r = await correrTarea(tareaBcrdPortada, almacenPg(pool), { ahora, obtener: respuesta(texto("bcrd/portada.html")) });
    expect(r).toMatchObject({ estado: "ok", filas: 6 });
    // 61.6788 (portada, 14 oct) − 61.5396 (Excel, 13 oct)
    expect(await ultimo("USDDOP_VENTA")).toMatchObject({ fecha_dato: "2026-10-14", valor: "61.6788", cambio: "0.1392" });
    expect(await ultimo("USDDOP_COMPRA")).toMatchObject({ fecha_dato: "2026-10-14", valor: "61.1477", cambio: "0.0328" });
    expect(await ultimo("INFLACION_RD")).toMatchObject({ fecha_dato: "2026-09-30", valor: "5.12", fuente_id: "bcrd" });
    expect(await ultimo("TASA_ACT_MN_PROMEDIO")).toMatchObject({ fecha_dato: "2026-09-30", valor: "13.65" });
  });

  it("repetir las corridas no reescribe nada", async () => {
    const r1 = await correrTarea(tareaBcrdPortada, almacenPg(pool), { ahora, obtener: respuesta(texto("bcrd/portada.html")) });
    const r2 = await correrTarea(tareaExcel, almacenPg(pool), { ahora, obtener: () => Promise.reject(new Error("no se usa")) });
    expect(r1.filas).toBe(0);
    expect(r2.filas).toBe(0);
  });

  it("crédito público: 8 subastas en emisiones_rd, idempotente", async () => {
    const html = texto("credito-publico/subastas-2026.html");
    const r = await correrTarea(tareaCreditoPublico, almacenPg(pool), { ahora, obtener: respuesta(html) });
    expect(r).toMatchObject({ estado: "ok", filas: 8 });
    await correrTarea(tareaCreditoPublico, almacenPg(pool), { ahora, obtener: respuesta(html) });
    const { rows } = await pool.query(
      "select fuente, fecha::text, instrumento, monto, tasa, origen from mercado.emisiones_rd order by fecha desc",
    );
    expect(rows).toHaveLength(8);
    expect(rows[0]).toEqual({
      fuente: "CREDITO_PUBLICO",
      fecha: "2026-09-09",
      instrumento: "Segunda ronda subasta extraordinaria no competitiva",
      monto: null,
      tasa: null,
      origen: "automatica",
    });
  });

  it("SIMV y MICM: avisos en instituciones_feed sin duplicar y 20 precios de combustibles", async () => {
    const simv = await correrTarea(tareaSimv, almacenPg(pool), { ahora, obtener: respuesta(texto("simv/feed-truncado.xml")) });
    const micm = await correrTarea(tareaMicm, almacenPg(pool), { ahora, obtener: respuesta(texto("micm/feed.xml")) });
    expect(simv).toMatchObject({ estado: "ok", filas: 3 });
    expect(micm).toMatchObject({ estado: "ok", filas: 22 }); // 2 avisos + 20 precios
    const otra = await correrTarea(tareaSimv, almacenPg(pool), { ahora, obtener: respuesta(texto("simv/feed-truncado.xml")) });
    expect(otra.filas).toBe(0);
    const { rows } = await pool.query("select institucion, count(*)::int as n from mercado.instituciones_feed group by 1 order by 1");
    expect(rows).toEqual([{ institucion: "MICM", n: 2 }, { institucion: "SIMV", n: 3 }]);
    expect(await ultimo("COMB_GASOIL_OPTIMO")).toMatchObject({ fecha_dato: "2026-10-10", valor: "318.1", cambio: "12", fuente_id: "micm" });
  });
});

describe("lo que ve cada quien", () => {
  it("Mena lee observaciones, emisiones y avisos; un intruso no ve nada", async () => {
    const consulta = async (c: pg.PoolClient) => ({
      obs: (await c.query("select count(*)::int as n from mercado.observaciones where serie_id like 'USDDOP_%'")).rows[0].n,
      emisiones: (await c.query("select count(*)::int as n from mercado.emisiones_rd")).rows[0].n,
      feed: (await c.query("select count(*)::int as n from mercado.instituciones_feed")).rows[0].n,
      fondos: (await c.query("select count(*)::int as n from mercado.fondos_rendimientos")).rows[0].n,
    });
    const mena = await como(pool, "authenticated", MENA, consulta);
    expect(mena.obs).toBeGreaterThan(500);
    expect(mena).toMatchObject({ emisiones: 8, feed: 5, fondos: 0 });
    expect(await como(pool, "authenticated", INTRUSO, consulta)).toEqual({ obs: 0, emisiones: 0, feed: 0, fondos: 0 });
  });
});
