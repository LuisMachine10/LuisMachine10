import "server-only";
import { cache } from "react";
import type { EstadoTarea } from "@/componentes/CurvaTesoro";
import {
  type FilaFondo,
  type FuenteRD,
  type ObsRD,
  type SerieRD,
  SERIES_COMBUSTIBLES,
  SERIES_DOLAR,
  SERIES_MACRO_RD,
  SERIES_TASAS,
  TAREAS_RD,
} from "@/lib/rd";
import { mercado } from "@/lib/supabase/servidor";

// Lecturas del módulo República Dominicana. Las cifras se piden como texto (::text): nunca float.
// cache() de React: los paneles de una misma petición comparten una sola ronda de consultas.

const COLUMNAS_OBS = "serie_id, valor::text, cambio::text, fecha_dato, recogido_en, url_dato, fuente_id";
const FUENTES_RD = ["bcrd", "bcrd_excel", "credito_publico", "simv", "micm", "manual", "bvrd_calculadora"];

export interface EmisionRD {
  id: number;
  fuente: "SIMV" | "CREDITO_PUBLICO" | "BCRD" | "BVRD";
  numero: string;
  emisor: string | null;
  instrumento: string | null;
  monto: string | null;
  moneda: string | null;
  tasa: string | null;
  fecha: string;
  url: string;
  descripcion: string | null;
  origen: "automatica" | "manual";
  recogido_en: string;
}

export interface AvisoInstitucion {
  id: number;
  institucion: string;
  titulo: string;
  url: string;
  fecha: string;
}

export interface CargaManual {
  id: number;
  dato: string;
  serie_id: string | null;
  valor: string;
  fecha: string;
  nota: string | null;
  url_fuente: string | null;
  creado_en: string;
}

export interface EstadoTareaRD extends EstadoTarea {
  tarea: string;
}

function exigir<T>(r: { data: unknown; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`No se pudo leer ${que}: ${r.error.message}`);
  return (r.data ?? []) as T;
}

function haceDias(dias: number): string {
  return new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
}

export const datosRD = cache(async () => {
  const db = await mercado();
  const [series, dolar, macro, tasas, combustibles, fuentes, tareas, emisiones, avisos, fondos, manuales] = await Promise.all([
    db.from("series").select("id, nombre, nombre_corto, unidad, frecuencia, max_antiguedad_min, fuente_id, orden")
      .in("id", [...SERIES_DOLAR, ...SERIES_MACRO_RD, ...SERIES_TASAS, ...SERIES_COMBUSTIBLES]).order("orden"),
    db.from("observaciones").select(COLUMNAS_OBS).in("serie_id", [...SERIES_DOLAR]).gte("fecha_dato", haceDias(45))
      .order("fecha_dato", { ascending: false }).limit(200),
    db.from("observaciones").select(COLUMNAS_OBS).in("serie_id", [...SERIES_MACRO_RD]).gte("fecha_dato", haceDias(400))
      .order("fecha_dato", { ascending: false }).limit(100),
    db.from("observaciones").select(COLUMNAS_OBS).in("serie_id", SERIES_TASAS).gte("fecha_dato", haceDias(200))
      .order("fecha_dato", { ascending: false }).limit(500),
    db.from("observaciones").select(COLUMNAS_OBS).in("serie_id", [...SERIES_COMBUSTIBLES]).gte("fecha_dato", haceDias(60))
      .order("fecha_dato", { ascending: false }).limit(300),
    db.from("fuentes").select("id, nombre, url").in("id", FUENTES_RD),
    db.from("estado_tareas").select("tarea, estado, inicio, ultima_ok, error").in("tarea", [...TAREAS_RD]),
    db.from("emisiones_rd")
      .select("id, fuente, numero, emisor, instrumento, monto::text, moneda, tasa::text, fecha, url, descripcion, origen, recogido_en")
      .order("fecha", { ascending: false }).limit(60),
    db.from("instituciones_feed").select("id, institucion, titulo, url, fecha").in("institucion", ["SIMV", "MICM"])
      .order("fecha", { ascending: false }).limit(20),
    db.from("fondos_rendimientos")
      .select("id, safi, fondo, moneda, plazo_dias, rendimiento::text, fecha_corte, url_fuente, nota")
      .order("fecha_corte", { ascending: false }).limit(400),
    db.from("carga_manual").select("id, dato, serie_id, valor::text, fecha, nota, url_fuente, creado_en")
      .order("creado_en", { ascending: false }).limit(15),
  ]);
  return {
    series: exigir<SerieRD[]>(series, "las series de RD"),
    observaciones: [
      ...exigir<ObsRD[]>(dolar, "el dólar"),
      ...exigir<ObsRD[]>(macro, "TPM e inflación"),
      ...exigir<ObsRD[]>(tasas, "las tasas"),
      ...exigir<ObsRD[]>(combustibles, "los combustibles"),
    ],
    fuentes: exigir<FuenteRD[]>(fuentes, "las fuentes"),
    tareas: exigir<EstadoTareaRD[]>(tareas, "el estado de las tareas"),
    emisiones: exigir<EmisionRD[]>(emisiones, "las emisiones"),
    avisos: exigir<AvisoInstitucion[]>(avisos, "los avisos de SIMV y MICM"),
    fondos: exigir<FilaFondo[]>(fondos, "los fondos de inversión"),
    manuales: exigir<CargaManual[]>(manuales, "la carga manual"),
  };
});

export type DatosRD = Awaited<ReturnType<typeof datosRD>>;

/** Series disponibles para el formulario de carga manual. */
export async function seriesParaCarga() {
  const db = await mercado();
  const r = await db.from("series").select("id, nombre, unidad, fuente_id").order("orden");
  return exigir<Array<{ id: string; nombre: string; unidad: string; fuente_id: string }>>(r, "las series");
}
