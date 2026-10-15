import "server-only";
import { cache } from "react";
import { configServidor } from "@/lib/config";
import type { Explicacion, FuenteMercado, ObsMercado, PuntoIntradia, SerieMercado } from "@/lib/mercado-vista";
import { mercado } from "@/lib/supabase/servidor";

// Lecturas del módulo «mercado en vivo». Las cifras se piden como texto (::text): nunca pasan por float.
// cache(): los paneles de una misma página comparten una sola lectura por petición.

export const TAREAS_MERCADO = ["cotizaciones-fmp", "cotizaciones-finnhub", "tasas-politica", "movimientos-acciones"] as const;

/** Series que tienen los paneles de este módulo. */
const SERIES_SPARKLINE = ["ORO", "PLATA", "COBRE_CPER"];

export interface Movimiento {
  fecha: string;
  tipo: "sube" | "baja";
  posicion: number;
  simbolo: string;
  nombre: string | null;
  precio: string;
  cambio: string | null;
  cambio_pct: string | null;
  bolsa: string | null;
  recogido_en: string;
}

export interface CargaManual {
  serie_id: string;
  valor: string;
  fecha: string;
  url_fuente: string | null;
  nota: string | null;
  creado_en: string;
}

export interface EstadoTareaMercado {
  tarea: string;
  estado: string;
  fuente_id: string | null;
  inicio: string;
  ultima_ok: string | null;
  error: string | null;
}

export interface DatosMercado {
  series: SerieMercado[];
  ultimas: ObsMercado[];
  intradia: PuntoIntradia[];
  explicaciones: Explicacion[];
  movimientos: Movimiento[];
  cargaManual: CargaManual[];
  fuentes: FuenteMercado[];
  tareas: EstadoTareaMercado[];
}

function exigir<T>(r: { data: T | null; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`No se pudo leer ${que}: ${r.error.message}`);
  return (r.data ?? []) as T;
}

export const datosMercado = cache(async (): Promise<DatosMercado> => {
  const db = await mercado();
  const hace4dias = new Date(Date.now() - 4 * 86_400_000).toISOString();
  const hace24h = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const [series, ultimas, intradia, explicaciones, movimientos, manual, fuentes, tareas] = await Promise.all([
    db
      .from("series")
      .select("id, nombre, nombre_corto, categoria, unidad, moneda, fuente_id, frecuencia, max_antiguedad_min, orden, sustituto_de, meta, activa")
      .order("orden"),
    db
      .from("ultimas_obs_mercado")
      .select("serie_id, valor::text, cambio::text, cambio_pct::text, cambio_origen, fecha_dato, hora_dato, recogido_en, url_dato, estado, fuente_id"),
    db
      .from("observaciones")
      .select("serie_id, valor::text, fecha_dato, hora_dato")
      .in("serie_id", SERIES_SPARKLINE)
      .gte("hora_dato", hace4dias)
      .order("hora_dato")
      .limit(3000),
    db.from("explicaciones").select("serie_id, texto, fuentes, fecha").eq("tipo", "porque").gte("fecha", hace24h).order("fecha", { ascending: false }).limit(200),
    db
      .from("movimientos_acciones")
      .select("fecha, tipo, posicion, simbolo, nombre, precio::text, cambio::text, cambio_pct::text, bolsa, recogido_en")
      .order("fecha", { ascending: false })
      .order("posicion")
      .limit(40),
    db.from("carga_manual").select("serie_id, valor::text, fecha, url_fuente, nota, creado_en").eq("serie_id", "TASA_BOJ").order("fecha", { ascending: false }).limit(1),
    db.from("fuentes").select("id, nombre, url"),
    db.from("estado_tareas").select("tarea, estado, fuente_id, inicio, ultima_ok, error").in("tarea", [...TAREAS_MERCADO]),
  ]);
  const movs = exigir(movimientos, "los movimientos de acciones") as unknown as Movimiento[];
  const ultimaFecha = movs[0]?.fecha;
  return {
    series: exigir(series, "las series") as SerieMercado[],
    ultimas: exigir(ultimas, "las últimas cotizaciones") as unknown as ObsMercado[],
    intradia: exigir(intradia, "las cotizaciones del día") as unknown as PuntoIntradia[],
    explicaciones: exigir(explicaciones, "las explicaciones") as Explicacion[],
    movimientos: movs.filter((m) => m.fecha === ultimaFecha),
    cargaManual: exigir(manual, "la carga manual") as unknown as CargaManual[],
    fuentes: exigir(fuentes, "las fuentes") as FuenteMercado[],
    tareas: exigir(tareas, "el estado de las tareas") as EstadoTareaMercado[],
  };
});

/** URL y clave publicable para la suscripción Realtime del navegador (pública por diseño; RLS protege). */
export function configRealtime(): { url: string; clave: string } | null {
  try {
    const c = configServidor();
    return { url: c.supabaseUrl, clave: c.supabaseClave };
  } catch {
    return null;
  }
}
