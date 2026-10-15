import "server-only";
import { personal } from "@/lib/supabase/servidor";
import { COLUMNAS, type FilasCaja, filasADatos, ORDEN, ultimaEdicion } from "./filas";
import type { DatosCaja } from "./tipos";

export interface LecturaCaja {
  datos: DatosCaja;
  /** Última edición de Mena (ISO) para el sello. */
  editadoEn: string | null;
}

type Tabla = keyof typeof COLUMNAS;
const PAGINA = 1000;

/** Lee todo el Calendario de Caja (RLS aplica: solo Mena). Lanza con el motivo si la base no responde. */
export async function leerCaja(): Promise<LecturaCaja> {
  const db = await personal();
  // PostgREST corta en 1,000 filas por respuesta (max-rows de Supabase): se pide por páginas.
  const leer = async (tabla: Tabla) => {
    const filas: Record<string, unknown>[] = [];
    for (let desde = 0; ; desde += PAGINA) {
      let q = db.from(tabla).select(COLUMNAS[tabla]);
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
  const [config, cuentas, categorias, recurrentes, movimientos, omitidos, saldos, notas] = await Promise.all([
    leer("caja_config"),
    leer("caja_cuentas"),
    leer("caja_categorias"),
    leer("caja_recurrentes"),
    leer("caja_movimientos"),
    leer("caja_omitidos"),
    leer("caja_saldos_reales"),
    leer("caja_notas"),
  ]);
  const filas: FilasCaja = { config: config[0] ?? null, cuentas, categorias, recurrentes, movimientos, omitidos, saldos, notas };
  return { datos: filasADatos(filas), editadoEn: ultimaEdicion(filas) };
}
