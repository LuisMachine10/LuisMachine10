// Punta a punta sin red: XML real del Tesoro → parser → mercado.registrar_observaciones → lo que ve Mena.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Big from "big.js";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tareaTesoro, urlXmlTesoro } from "../../supabase/functions/_shared/fuentes/tesoro.ts";
import { correrTarea } from "../../supabase/functions/_shared/ingesta.ts";
import { almacenPg } from "./almacen-pg";
import { baseNueva, como } from "./base";

const XML_OCT = readFileSync(join(import.meta.dirname, "..", "muestras", "tesoro", "daily_treasury_yield_curve_202610.xml"), "utf8");
const VACIO = `<feed xmlns="http://www.w3.org/2005/Atom"><title type="text">DailyTreasuryYieldCurveRateData</title></feed>`;
const MENA = "11111111-1111-1111-1111-111111111111";

let pool: pg.Pool;

beforeAll(async () => {
  pool = await baseNueva("strategya_pruebas_ingesta");
  await pool.query("insert into auth.users (id, email) values ($1, 'mena@ejemplo.do')", [MENA]);
  await pool.query("insert into mercado.usuarios_autorizados (user_id) values ($1)", [MENA]);
});

afterAll(async () => {
  await pool?.end();
});

const dependencias = {
  ahora: () => new Date("2026-10-15T22:15:00Z"),
  obtener: async (url: string) => ({
    url,
    status: 200,
    tipo: "text/xml",
    texto: url === urlXmlTesoro("202610") ? XML_OCT : VACIO,
    intentos: 1,
  }),
};

describe("ingesta del Tesoro de punta a punta", () => {
  it("primera corrida: 126 observaciones nuevas y corrida ok visible en /estado", async () => {
    const r = await correrTarea(tareaTesoro, almacenPg(pool), dependencias);
    expect(r).toMatchObject({ estado: "ok", filas: 126 });
    const estado = await pool.query("select tarea, estado, filas, detalle->>'ultima_fecha' as ultima from mercado.estado_tareas");
    expect(estado.rows).toEqual([{ tarea: "tesoro", estado: "ok", filas: 126, ultima: "2026-10-14" }]);
  });

  it("segunda corrida con los mismos datos: no reescribe nada", async () => {
    const r = await correrTarea(tareaTesoro, almacenPg(pool), dependencias);
    expect(r).toMatchObject({ estado: "ok", filas: 0 });
    expect(r.detalle).toMatchObject({ recibidas: 126, insertadas: 0, actualizadas: 0 });
  });

  it("Mena ve la curva del 14 oct con su cambio diario exacto contra el 13 oct", async () => {
    await como(pool, "authenticated", MENA, async (c) => {
      const { rows } = await c.query(
        `select o.serie_id, o.valor::text, o.cambio::text, o.fuente_id, o.url_dato
           from mercado.observaciones o join mercado.series s on s.id = o.serie_id
          where o.fecha_dato = '2026-10-14' order by s.orden`,
      );
      expect(rows).toHaveLength(14);
      const diez = rows.find((f) => f.serie_id === "UST_10A");
      expect(diez).toMatchObject({ valor: "5.19", fuente_id: "tesoro_eeuu" });
      // El cambio sale solo de los dos valores oficiales (14 oct − 13 oct), con aritmética decimal.
      const previo = await c.query(
        "select valor::text from mercado.observaciones where serie_id = 'UST_10A' and fecha_dato = '2026-10-13'",
      );
      expect(new Big(diez.cambio).eq(new Big(diez.valor).minus(previo.rows[0].valor))).toBe(true);
      expect(diez.url_dato).toContain("field_tdr_date_value_month=202610");
    });
  });
});
