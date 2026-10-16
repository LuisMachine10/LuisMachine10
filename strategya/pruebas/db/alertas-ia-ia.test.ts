// Fase 6 · IA contra Postgres real: candidatos del porqué, gasto del mes y tope, tareas ia-porque e ia-resumen
// de punta a punta (con respuestas SINTÉTICAS de la Messages API) y el pedido manual limitado a 15 min.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { correrTarea } from "../../supabase/functions/_shared/ingesta.ts";
import { tareaIaPorque } from "../../supabase/functions/_shared/fuentes/ia-porque.ts";
import { tareaIaResumen } from "../../supabase/functions/_shared/fuentes/ia-resumen.ts";
import type { OpcionesApi } from "../../supabase/functions/_shared/http.ts";
import { CAUSA_NO_CONFIRMADA } from "../../supabase/functions/_shared/ia.ts";
import { respuestaHttp, respuestaSintetica } from "../apoyo/anthropic-sintetica.ts";
import { almacenPg } from "./almacen-pg";
import { baseNueva, como, debeFallar } from "./base";

const MENA = "11111111-1111-1111-1111-111111111111";
const INTRUSO = "22222222-2222-2222-2222-222222222222";
const URL_ORO = "https://noticias.ejemplo.org/oro-fed";
const URL_GUERRA = "https://noticias.ejemplo.org/tregua";

let pool: pg.Pool;

function diaRD(desplazamiento = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date(Date.now() + desplazamiento * 86_400_000));
}

async function servicio(sql: string, params: unknown[] = []) {
  const c = await pool.connect();
  try {
    await c.query("set role service_role");
    return await c.query(sql, params);
  } finally {
    await c.query("reset role");
    c.release();
  }
}

function entorno(extra: Record<string, string> = {}) {
  const e: Record<string, string> = { ANTHROPIC_API_KEY: "sk-prueba", ...extra };
  return (n: string) => e[n];
}

beforeAll(async () => {
  pool = await baseNueva("strategya_pruebas_alertas_ia_ia");
  await pool.query("insert into auth.users (id, email) values ($1, 'mena@ejemplo.do'), ($2, 'otro@ejemplo.do')", [MENA, INTRUSO]);
  await pool.query("insert into mercado.usuarios_autorizados (user_id) values ($1)", [MENA]);
  const hace2min = new Date(Date.now() - 120_000).toISOString();
  await servicio("select * from mercado.registrar_observaciones(null, $1::jsonb)", [
    JSON.stringify([
      { serie_id: "ORO", valor: "4312.5", fecha_dato: diaRD(), hora_dato: hace2min, cambio: "98.8", cambio_pct: "2.35" },
      { serie_id: "EURUSD", valor: "1.1", fecha_dato: diaRD(), hora_dato: hace2min, cambio: "0.001", cambio_pct: "0.09" },
      { serie_id: "ETF_GLD", valor: "390", fecha_dato: diaRD(), hora_dato: hace2min, cambio: "9", cambio_pct: "2.36" },
    ]),
  ]);
  await servicio(
    `insert into mercado.noticias (titular, url, medio, fecha, pais, categoria, hash) values
      ('Gold jumps as Fed signals pause', $1, 'Medio A', now() - interval '1 hour', null, 'mercado', 'h1'),
      ('Ceasefire talks stall in Gaza', $2, 'Medio B', now() - interval '2 hours', 'Palestina', 'guerra', 'h2'),
      ('Titular viejo', 'https://noticias.ejemplo.org/viejo', 'Medio C', now() - interval '3 days', null, 'mercado', 'h3')`,
    [URL_ORO, URL_GUERRA],
  );
});

afterAll(async () => {
  await pool?.end();
});

describe("funciones SQL de la IA", () => {
  it("candidatos: solo series sobre su umbral, sin ETF sustitutos", async () => {
    const { rows } = await servicio("select mercado.ia_candidatos_porque() as r");
    expect(rows[0].r).toEqual([expect.objectContaining({ serie_id: "ORO", valor: "4312.5", cambio_pct: "2.35", umbral: "1.5", categoria: "metal" })]);
  });

  it("titulares: últimas 24 h y por categoría", async () => {
    const { rows } = await servicio("select mercado.ia_titulares(now() - interval '24 hours', $1::jsonb) as r", [JSON.stringify(["mercado", "rd"])]);
    expect((rows[0].r as Array<{ url: string }>).map((t) => t.url)).toEqual([URL_ORO]);
  });

  it("gasto del mes: suma exacta de costo_usd", async () => {
    const { rows } = await servicio("select mercado.gasto_ia_mes() as r");
    expect(rows[0].r).toBe("0");
  });
});

describe("tarea ia-porque", () => {
  it("sin ANTHROPIC_API_KEY: parcial y sin llamadas", async () => {
    const r = await correrTarea(tareaIaPorque, almacenPg(pool), {
      obtener: () => Promise.reject(new Error("no")),
      api: () => Promise.reject(new Error("no debió llamar")),
      entorno: () => undefined,
    });
    expect(r.estado).toBe("parcial");
    expect(r.error).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("guarda el porqué validado con su fuente, costo y encabezados correctos", async () => {
    const pedidos: { url: string; op?: OpcionesApi }[] = [];
    const salida = JSON.stringify({ explicado: true, texto: "El oro subió 2.35 % tras las señales de pausa de la Fed.", fuentes: [{ url: URL_ORO }] });
    const r = await correrTarea(tareaIaPorque, almacenPg(pool), {
      obtener: () => Promise.reject(new Error("no")),
      api: async (url, op) => {
        pedidos.push({ url, op });
        return respuestaHttp(url, respuestaSintetica(salida));
      },
      entorno: entorno(),
    });
    expect(r.estado).toBe("ok");
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].url).toBe("https://api.anthropic.com/v1/messages");
    expect(pedidos[0].op?.encabezados).toMatchObject({ "x-api-key": "sk-prueba", "anthropic-version": "2023-06-01" });
    const cuerpo = pedidos[0].op?.cuerpo as { model: string; messages: Array<{ content: string }> };
    expect(cuerpo.model).toBe("claude-haiku-5-5");
    expect(cuerpo.messages[0].content).toContain("valor 4312.5 US$/oz");
    expect(cuerpo.messages[0].content).toContain(URL_ORO);

    const { rows } = await pool.query("select serie_id, tipo, texto, fuentes, modelo, costo_usd::text, confirmada from mercado.explicaciones");
    expect(rows).toEqual([
      {
        serie_id: "ORO",
        tipo: "porque",
        texto: "El oro subió 2.35 % tras las señales de pausa de la Fed.",
        fuentes: [{ titulo: "Gold jumps as Fed signals pause", url: URL_ORO }],
        modelo: "claude-haiku-5-5",
        costo_usd: "0.000195",
        confirmada: true,
      },
    ]);
  });

  it("no repite la serie dentro de 15 min", async () => {
    const { rows } = await servicio("select mercado.ia_candidatos_porque() as r");
    expect(rows[0].r).toEqual([]);
  });

  it("salida con una cifra inventada → «causa no confirmada» (y el costo cuenta)", async () => {
    await pool.query("delete from mercado.explicaciones");
    const salida = JSON.stringify({ explicado: true, texto: "El oro subió 7 % por la Fed.", fuentes: [{ url: URL_ORO }] });
    await correrTarea(tareaIaPorque, almacenPg(pool), {
      obtener: () => Promise.reject(new Error("no")),
      api: async (url) => respuestaHttp(url, respuestaSintetica(salida)),
      entorno: entorno(),
    });
    const { rows } = await pool.query("select texto, confirmada, costo_usd::text, datos ->> 'motivo' as motivo from mercado.explicaciones");
    expect(rows).toEqual([{ texto: CAUSA_NO_CONFIRMADA, confirmada: false, costo_usd: "0.000195", motivo: expect.stringMatching(/cifras/) }]);
  });

  it("los porqués paran al 70 % del tope para dejar presupuesto a los resúmenes", async () => {
    await pool.query("delete from mercado.explicaciones");
    await servicio("insert into mercado.explicaciones (tipo, texto, modelo, costo_usd) values ('porque', 'x', 'claude-haiku-5-5', 0.36)");
    let llamadas = 0;
    const r = await correrTarea(tareaIaPorque, almacenPg(pool), {
      obtener: () => Promise.reject(new Error("no")),
      api: async () => {
        llamadas++;
        throw new Error("no debió llamar");
      },
      entorno: entorno({ IA_TOPE_MENSUAL_USD: "0.5" }),
    });
    expect(llamadas).toBe(0);
    expect(r.estado).toBe("parcial");
    expect(r.error).toMatch(/su parte del tope/);
    await pool.query("delete from mercado.explicaciones");
  });

  it("con el tope alcanzado no llama a la IA", async () => {
    await pool.query("delete from mercado.explicaciones");
    await servicio("insert into mercado.explicaciones (tipo, texto, modelo, costo_usd) values ('cinco_del_dia', 'x', 'claude-sonnet-5-5', 0.5)");
    let llamadas = 0;
    const r = await correrTarea(tareaIaPorque, almacenPg(pool), {
      obtener: () => Promise.reject(new Error("no")),
      api: async () => {
        llamadas++;
        throw new Error("no debió llamar");
      },
      entorno: entorno({ IA_TOPE_MENSUAL_USD: "0.5" }),
    });
    expect(llamadas).toBe(0);
    expect(r.estado).toBe("parcial");
    expect(r.error).toMatch(/Tope de IA alcanzado/);
    expect(r.detalle).toMatchObject({ tope_alcanzado: true, gasto_mes_usd: "0.5", tope_usd: "0.5" });
    await pool.query("delete from mercado.explicaciones");
  });
});

describe("tarea ia-resumen", () => {
  it("guarda Las 5 del día y Guerras con la estructura en datos", async () => {
    const cinco = JSON.stringify({
      items: [{ titulo: "La Fed señala pausa", resumen: "La Fed dio señales de pausa. El oro subió 2.35 %.", porque: "Las tasas mueven al dólar.", y_que: "El dólar pesa en lo que RD importa.", url: URL_ORO }],
    });
    const guerras = JSON.stringify({
      conflictos: [{ conflicto: "Gaza", pais: "Palestina", estado: "TENSIÓN", que_paso: "Las conversaciones de tregua se estancaron.", mercado: "El petróleo sigue el tema.", url: URL_GUERRA }],
    });
    const modelos: string[] = [];
    const r = await correrTarea(tareaIaResumen, almacenPg(pool), {
      obtener: () => Promise.reject(new Error("no")),
      api: async (url, op) => {
        const c = op?.cuerpo as { model: string; system: string };
        modelos.push(c.model);
        const esGuerra = c.system.includes("Guerras en el mundo");
        return respuestaHttp(url, respuestaSintetica(esGuerra ? guerras : cinco, { model: "claude-sonnet-5-5" }));
      },
      entorno: entorno(),
    });
    expect(r.estado).toBe("ok");
    expect(modelos).toEqual(["claude-sonnet-5-5", "claude-sonnet-5-5"]);
    const { rows } = await pool.query("select tipo, datos, fuentes, confirmada, costo_usd::text from mercado.explicaciones order by tipo");
    expect(rows.map((f) => f.tipo)).toEqual(["cinco_del_dia", "guerras"]);
    expect(rows[0].datos.items[0]).toMatchObject({ titulo: "La Fed señala pausa", url: URL_ORO });
    expect(rows[1].datos.conflictos[0]).toMatchObject({ estado: "TENSIÓN", pais: "Palestina" });
    expect(rows[1].fuentes).toEqual([{ titulo: "Ceasefire talks stall in Gaza", url: URL_GUERRA }]);
    // 1200 × 2 / 1M + 150 × 10 / 1M = 0.0039 por llamada (Sonnet 5.5).
    expect(rows.map((f) => f.costo_usd)).toEqual(["0.003900", "0.003900"]);
    const gasto = await servicio("select mercado.gasto_ia_mes() as r");
    expect(gasto.rows[0].r).toBe("0.007800");
  });
});

describe("pedir_resumen_ia", () => {
  it("Mena lo pide una vez cada 15 min; un intruso no puede", async () => {
    await pool.query("select mercado.configurar_tareas('https://abc.supabase.co', $1)", ["s".repeat(40)]);
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claim.sub', $1, true)", [MENA]);
      const primero = await c.query("select mercado.pedir_resumen_ia() as r");
      expect(primero.rows[0].r).toMatchObject({ ok: true });
      const segundo = await c.query("select mercado.pedir_resumen_ia() as r");
      expect(segundo.rows[0].r).toMatchObject({ ok: false, motivo: "espera" });
      await c.query("reset role");
      const pedidos = await c.query("select body from net.pedidos_simulados where body ->> 'tarea' = 'ia-resumen'");
      expect(pedidos.rows).toHaveLength(1);
    } finally {
      await c.query("rollback");
      c.release();
    }
    await como(pool, "authenticated", INTRUSO, async (c2) => {
      await debeFallar(c2, "select mercado.pedir_resumen_ia()", /No autorizado/);
    });
    await como(pool, "anon", null, async (c3) => {
      await debeFallar(c3, "select mercado.pedir_resumen_ia()", /permission denied/);
    });
  });

  it("los horarios de la IA están programados (UTC)", async () => {
    const { rows } = await pool.query("select jobname, schedule from cron.job where jobname like 'strategya-ia-%' order by jobname");
    expect(rows).toEqual([
      { jobname: "strategya-ia-porque", schedule: "*/15 * * * *" },
      { jobname: "strategya-ia-resumen-manana", schedule: "35 11 * * *" },
      { jobname: "strategya-ia-resumen-tarde", schedule: "5 21 * * *" },
    ]);
  });
});
