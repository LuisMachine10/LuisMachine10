// Fondos automáticos contra Postgres real: migración, upsert de la tarea y «solo cambios» de AFI Reservas.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tareaFondosSafis, URL_EXCEL_FONDOS } from "../../supabase/functions/_shared/fuentes/fondos-safis.ts";
import type { Respuesta } from "../../supabase/functions/_shared/http.ts";
import { correrTarea } from "../../supabase/functions/_shared/ingesta.ts";
import { almacenPg } from "./almacen-pg";
import { baseNueva } from "./base";

const M = (n: string) => readFileSync(join(import.meta.dirname, "..", "muestras", "safis", n), "utf8");
const PAG: Record<string, string> = {
  [URL_EXCEL_FONDOS]: M("excel-fondosabiertos-real-2026-10-16.html"),
  "https://www.afireservas.com/fondos/fondo-larimar/": M("afireservas-larimar-real-2026-10-16.html"),
  "https://www.afireservas.com/fondos/fondo-caoba/": M("afireservas-caoba-real-2026-10-16.html"),
};
const obtener = async (url: string): Promise<Respuesta> => {
  if (!PAG[url]) throw new Error("HTTP 404");
  return { url, status: 200, tipo: "text/html", texto: PAG[url], intentos: 1 };
};

let pool: pg.Pool;
beforeAll(async () => {
  pool = await baseNueva("strategya_pruebas_fondos_safis");
});
afterAll(async () => {
  await pool?.end();
});

describe("fondos automáticos", () => {
  it("la migración amplía los plazos y programa la tarea", async () => {
    const c = await pool.query("select 1 from cron.job where jobname = 'strategya-fondos-safis'");
    expect(c.rowCount).toBe(1);
    await pool.query(
      "insert into mercado.fondos_rendimientos (safi, fondo, moneda, plazo_dias, rendimiento, fecha_corte, url_fuente) values ('X','Y','DOP',90,5,'2026-01-01','https://x.do/')",
    );
  });

  it("primera corrida: 20 de Excel + 8 de Reservas; segunda corrida al día siguiente: Reservas no se repite", async () => {
    const r1 = await correrTarea(tareaFondosSafis, almacenPg(pool), { ahora: () => new Date("2026-10-16T22:10:00Z"), obtener });
    expect(r1.estado).toBe("parcial"); // Quisqueya no está en las muestras
    const n = async (safi: string) =>
      Number((await pool.query("select count(*) from mercado.fondos_rendimientos where safi = $1 and origen = 'automatica'", [safi])).rows[0].count);
    expect(await n("Excel SAFI")).toBe(20);
    expect(await n("AFI Reservas")).toBe(8);
    await correrTarea(tareaFondosSafis, almacenPg(pool), { ahora: () => new Date("2026-10-17T13:10:00Z"), obtener });
    expect(await n("Excel SAFI")).toBe(20); // misma fecha de la SAFI: se actualiza, no se duplica
    expect(await n("AFI Reservas")).toBe(8); // mismas cifras: no se inventa un corte nuevo
    const cuota = await pool.query(
      "select valor_cuota::text, fecha_corte::text from mercado.fondos_rendimientos where fondo = 'Fondo Abierto Dinámico Excel' and moneda = 'USD' and plazo_dias = 30",
    );
    expect(cuota.rows).toEqual([{ valor_cuota: "106", fecha_corte: "2026-10-04" }]);
  });
});
