import "server-only";
import { cache } from "react";
import { ETIQUETAS, leerMercadoCacheado } from "@/lib/supabase/cache-mercado";
import { personal } from "@/lib/supabase/servidor";
import { hoyRD } from "./fechas";
import { COLUMNAS_COMPLETAS, COLUMNAS_ENLACE, conRegistro, type FilaEnlace, type FilasCaja, filasADatos, ORDEN, ultimaEdicion } from "./filas";
import type { TasaDia, TasasUSD } from "./tasas";
import type { DatosCaja } from "./tipos";

export interface LecturaCaja {
  datos: DatosCaja;
  /** Última edición de Mena (ISO) para el sello. */
  editadoEn: string | null;
  /** Cuenta del Presupuesto → fila del registro único del Portafolio (caja_cuentas.registro_id). */
  enlaces: Record<string, string>;
}

type Tabla = keyof typeof COLUMNAS_COMPLETAS;
const PAGINA = 1000;
/** Días de historia del dólar BCRD que se leen (los movimientos más viejos sin tasa quedan «no confirmado»). */
const DIAS_TASAS = 800;

/**
 * Dólar de venta del BCRD (mercado.observaciones · USDDOP_VENTA), datos diarios con estado ok. Es dato de
 * mercado (igual para todos): pasa por la caché compartida (5 min). Si no se puede leer, null: los montos en
 * US$ quedan «no confirmado» y el Presupuesto sigue.
 */
export async function tasasUSD(): Promise<TasasUSD | null> {
  const hoy = hoyRD();
  try {
    const serie = await leerMercadoCacheado(
      `tasas-usd-bcrd:${hoy}`,
      300,
      async (db) => {
        const desde = new Date(Date.now() - DIAS_TASAS * 86_400_000).toISOString().slice(0, 10);
        const r = await db
          .from("observaciones")
          .select("fecha_dato, valor::text, url_dato")
          .eq("serie_id", "USDDOP_VENTA")
          .is("hora_dato", null)
          .eq("estado", "ok")
          .gte("fecha_dato", desde)
          .order("fecha_dato", { ascending: true })
          .limit(1000);
        if (r.error) throw new Error(r.error.message);
        return ((r.data ?? []) as unknown as { fecha_dato: string; valor: string; url_dato: string | null }[]).map(
          (f): TasaDia => ({ fecha: String(f.fecha_dato).slice(0, 10), valor: f.valor, url: f.url_dato }),
        );
      },
      [ETIQUETAS.rd],
    );
    return { hoy, serie };
  } catch {
    return null;
  }
}

/**
 * Lee todo el Presupuesto (RLS aplica: solo Mena). Lanza con el motivo si la base no responde.
 * Una sola vez por petición (React cache): el Portafolio, sus widgets y la foto del Boletín la comparten.
 */
export const leerCaja = cache(async (): Promise<LecturaCaja> => {
  const db = await personal();
  // PostgREST corta en 1,000 filas por respuesta (max-rows de Supabase): se pide por páginas.
  const leer = async (tabla: Tabla) => {
    const filas: Record<string, unknown>[] = [];
    for (let desde = 0; ; desde += PAGINA) {
      let q = db.from(tabla).select(COLUMNAS_COMPLETAS[tabla]);
      for (const col of (ORDEN as Partial<Record<Tabla, readonly string[]>>)[tabla] ?? []) q = q.order(col, { ascending: true });
      if (tabla === "caja_omitidos" || tabla === "caja_saldos_reales") q = q.order("fecha").order(tabla === "caja_omitidos" ? "recurrente_id" : "cuenta_id");
      if (tabla === "caja_notas") q = q.order("fecha");
      const r = await q.range(desde, desde + PAGINA - 1);
      if (r.error) throw new Error(`No se pudo leer ${tabla}: ${r.error.message}`);
      const pagina = (r.data ?? []) as unknown as Record<string, unknown>[];
      filas.push(...pagina);
      if (pagina.length < PAGINA) return filas;
    }
  };
  const [config, cuentas, categorias, recurrentes, movimientos, omitidos, saldos, notas, enl, tasas] = await Promise.all([
    leer("caja_config"),
    leer("caja_cuentas"),
    leer("caja_categorias"),
    leer("caja_recurrentes"),
    leer("caja_movimientos"),
    leer("caja_omitidos"),
    leer("caja_saldos_reales"),
    leer("caja_notas"),
    // Enlace con el registro único: tasa de préstamos y deudas, ciclo y parte en US$ de las tarjetas.
    db.from("caja_cuentas").select(COLUMNAS_ENLACE),
    tasasUSD(),
  ]);
  const filas: FilasCaja = { config: config[0] ?? null, cuentas, categorias, recurrentes, movimientos, omitidos, saldos, notas };
  const datos = filasADatos(filas);
  const enlaces = enl.error ? {} : conRegistro(datos, (enl.data ?? []) as unknown as FilaEnlace[]);
  datos.tasasUSD = tasas;
  return { datos, editadoEn: ultimaEdicion(filas), enlaces };
});
