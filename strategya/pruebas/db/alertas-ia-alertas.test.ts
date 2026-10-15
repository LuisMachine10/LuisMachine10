// Fase 5 · alertas contra Postgres real: reglas sembradas, evaluar_alertas (solo datos confirmados del día),
// una alerta por activo y día, envío por Resend de punta a punta y permisos de edición de umbrales.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { correrTarea } from "../../supabase/functions/_shared/ingesta.ts";
import { tareaAlertas } from "../../supabase/functions/_shared/fuentes/alertas.ts";
import { almacenPg } from "./almacen-pg";
import { baseNueva, como, debeFallar } from "./base";

const MENA = "11111111-1111-1111-1111-111111111111";
const INTRUSO = "22222222-2222-2222-2222-222222222222";

let pool: pg.Pool;

/** Fecha de hoy en RD (AAAA-MM-DD) y de días anteriores. */
function diaRD(desplazamiento = 0): string {
  const d = new Date(Date.now() + desplazamiento * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(d);
}

async function registrar(filas: Record<string, unknown>[]) {
  const c = await pool.connect();
  try {
    await c.query("set role service_role");
    await c.query("select * from mercado.registrar_observaciones(null, $1::jsonb)", [JSON.stringify(filas)]);
  } finally {
    await c.query("reset role");
    c.release();
  }
}

beforeAll(async () => {
  pool = await baseNueva("strategya_pruebas_alertas_ia_alertas");
  await pool.query("insert into auth.users (id, email) values ($1, 'mena@ejemplo.do'), ($2, 'otro@ejemplo.do')", [MENA, INTRUSO]);
  await pool.query("insert into mercado.usuarios_autorizados (user_id) values ($1)", [MENA]);
});

afterAll(async () => {
  await pool?.end();
});

describe("reglas sembradas", () => {
  it("trae los 15 umbrales pedidos con sus ids del catálogo", async () => {
    const { rows } = await pool.query("select serie_id, tipo, umbral::text, nota from mercado.reglas_alerta order by id");
    expect(rows.map((r) => `${r.serie_id}:${r.tipo}:${r.umbral ?? ""}`)).toEqual([
      "ORO:cambio_pct_dia:2",
      "ORO:nivel_bajo:4000",
      "ORO:nivel_sobre:4300",
      "PLATA:cambio_pct_dia:4",
      "PLATA:nivel_bajo:52",
      "PLATA:nivel_sobre:62",
      "COBRE_CPER:cambio_pct_dia:2.5",
      "USDDOP_VENTA:nivel_sobre:63",
      "USDDOP_VENTA:cambio_pct_dia:0.5",
      "TPM_BCRD:cualquier_cambio:",
      "TASA_FED_SUP:cualquier_cambio:",
      "BRENT:nivel_sobre:110",
      "BRENT:nivel_bajo:90",
      "IDX_SPX:cambio_pct_dia:2",
      "UST_10A:nivel_sobre:5.40",
    ]);
    expect(rows.find((r) => r.serie_id === "COBRE_CPER").nota).toMatch(/LME no aplica/);
  });
});

describe("evaluar_alertas", () => {
  it("dispara con datos confirmados de hoy, una vez por activo y día, y respeta el estado", async () => {
    const hace1min = new Date(Date.now() - 60_000).toISOString();
    await registrar([
      // Oro: +2.35 % y por encima de 4,300 → dos reglas; gana la de menor id (cambio_pct_dia).
      { serie_id: "ORO", valor: "4312.5", fecha_dato: diaRD(), hora_dato: hace1min, cambio: "98.8", cambio_pct: "2.35" },
      // Plata: bajo 52, pero no confirmada → no dispara.
      { serie_id: "PLATA", valor: "50.1", fecha_dato: diaRD(), hora_dato: hace1min, cambio: "-0.1", cambio_pct: "-0.2", estado: "no_confirmado" },
      // Brent sobre 110, pero de ayer → no dispara (no es del día de mercado).
      { serie_id: "BRENT", valor: "111", fecha_dato: diaRD(-1), hora_dato: new Date(Date.now() - 86_400_000).toISOString(), cambio: "1", cambio_pct: "0.9" },
      // S&P 500 −1.5 %: por debajo del umbral de ±2 %.
      { serie_id: "IDX_SPX", valor: "7000", fecha_dato: diaRD(), hora_dato: hace1min, cambio: "-106", cambio_pct: "-1.5" },
    ]);
    const { rows } = await pool.query("select mercado.evaluar_alertas() as r");
    const nuevas = rows[0].r as Array<{ serie_id: string; tipo: string; mensaje: string; valor: string }>;
    expect(nuevas).toHaveLength(1);
    expect(nuevas[0]).toMatchObject({ serie_id: "ORO", tipo: "cambio_pct_dia", valor: "4312.5", mensaje: "cambio del día +2.35 % (umbral ±2 %)" });

    // Otra pasada el mismo día: nada nuevo.
    const otra = await pool.query("select mercado.evaluar_alertas() as r");
    expect(otra.rows[0].r).toEqual([]);
  });

  it("no ve datos posteriores a p_ahora", async () => {
    const { rows } = await pool.query("select mercado.evaluar_alertas(now() - interval '1 hour') as r");
    expect(rows[0].r).toEqual([]);
  });

  it("cualquier_cambio: la TPM cambió y se confirmó hoy", async () => {
    await registrar([
      { serie_id: "TPM_BCRD", valor: "5.75", fecha_dato: diaRD(-3) },
      { serie_id: "TPM_BCRD", valor: "5.50", fecha_dato: diaRD() },
    ]);
    const { rows } = await pool.query("select mercado.evaluar_alertas() as r");
    expect(rows[0].r).toEqual([expect.objectContaining({ serie_id: "TPM_BCRD", tipo: "cualquier_cambio", mensaje: "cambió de 5.75 a 5.5 % (−0.25)" })]);
  });

  it("nivel_sobre del dólar con su unidad", async () => {
    await registrar([{ serie_id: "USDDOP_VENTA", valor: "63.2", fecha_dato: diaRD() }]);
    const { rows } = await pool.query("select mercado.evaluar_alertas() as r");
    expect(rows[0].r).toEqual([
      expect.objectContaining({ serie_id: "USDDOP_VENTA", tipo: "nivel_sobre", mensaje: "63.2 RD$ por US$, por encima del umbral de 63 RD$ por US$" }),
    ]);
  });

  it("una regla inactiva no dispara", async () => {
    await pool.query("update mercado.reglas_alerta set activa = false where serie_id = 'UST_10A'");
    await registrar([{ serie_id: "UST_10A", valor: "5.5", fecha_dato: diaRD() }]);
    const { rows } = await pool.query("select mercado.evaluar_alertas() as r");
    expect(rows[0].r).toEqual([]);
    await pool.query("update mercado.reglas_alerta set activa = true where serie_id = 'UST_10A'");
  });
});

describe("tarea alertas de punta a punta", () => {
  it("sin RESEND_API_KEY: parcial con aviso y nada enviado", async () => {
    const r = await correrTarea(tareaAlertas, almacenPg(pool), {
      obtener: () => Promise.reject(new Error("no")),
      api: () => Promise.reject(new Error("no debió llamar")),
      entorno: () => undefined,
    });
    expect(r.estado).toBe("parcial");
    expect(r.error).toMatch(/RESEND_API_KEY/);
    const { rows } = await pool.query("select count(*)::int as n from mercado.alertas_disparadas where enviada_en is null");
    expect(rows[0].n).toBe(4); // ORO, TPM, USDDOP y el 10 años (reactivado)
  });

  it("con clave: envía las pendientes, marca enviada_en y no reenvía", async () => {
    const asuntos: string[] = [];
    const deps = {
      obtener: () => Promise.reject(new Error("no")),
      api: async (url: string, op?: { cuerpo?: unknown }) => {
        asuntos.push((op?.cuerpo as { subject: string }).subject);
        return { url, status: 200, tipo: "application/json", texto: '{"id":"x"}', intentos: 1 };
      },
      entorno: (n: string) => ({ RESEND_API_KEY: "re_prueba", ALERTAS_EMAIL_DESTINO: "destino@ejemplo.do" })[n],
    };
    const r = await correrTarea(tareaAlertas, almacenPg(pool), deps);
    expect(r.estado).toBe("ok");
    expect(asuntos).toHaveLength(4);
    expect(asuntos).toContain("ALERTA · Oro · 4,312.50 US$/oz (+2.35 % en el día)");
    const { rows } = await pool.query("select count(*)::int as n from mercado.alertas_disparadas where enviada_en is not null and canal = 'correo'");
    expect(rows[0].n).toBe(4); // ORO, TPM, USDDOP y el 10 años (reactivado)

    asuntos.length = 0;
    await correrTarea(tareaAlertas, almacenPg(pool), deps);
    expect(asuntos).toEqual([]);
  });
});

describe("permisos", () => {
  it("Mena edita umbral, activa y nota; no otras columnas", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      const r = await c.query("update mercado.reglas_alerta set umbral = 63.5, nota = 'nueva' where serie_id = 'USDDOP_VENTA' and tipo = 'nivel_sobre'");
      expect(r.rowCount).toBe(1);
      await debeFallar(c, "update mercado.reglas_alerta set serie_id = 'ORO' where id = 1", /permission denied/);
      const h = await c.query("select count(*)::int as n from mercado.alertas_disparadas");
      expect(h.rows[0].n).toBe(4);
    });
  });

  it("un intruso no ve ni edita; nadie autenticado evalúa ni marca alertas", async () => {
    await como(pool, "authenticated", INTRUSO, async (c) => {
      const r = await c.query("update mercado.reglas_alerta set umbral = 1");
      expect(r.rowCount).toBe(0);
      const h = await c.query("select count(*)::int as n from mercado.alertas_disparadas");
      expect(h.rows[0].n).toBe(0);
    });
    await como(pool, "authenticated", MENA, async (c) => {
      await debeFallar(c, "select mercado.evaluar_alertas()", /permission denied/);
      await debeFallar(c, "select mercado.marcar_alerta_enviada(1, 'x')", /permission denied/);
    });
    await como(pool, "anon", null, async (c) => {
      await debeFallar(c, "select * from mercado.reglas_alerta", /permission denied/);
    });
  });

  it("la tarea alertas está programada cada 5 minutos", async () => {
    const { rows } = await pool.query("select schedule, command from cron.job where jobname = 'strategya-alertas'");
    expect(rows[0].schedule).toBe("*/5 * * * *");
    expect(rows[0].command).toContain('{"tarea":"alertas"}');
  });
});
