import "server-only";
import type {
  EntradaCapas,
  EventoGlobo,
  FuenteGlobo,
  NoticiaGlobo,
  ObservacionGlobo,
  SerieGlobo,
  TareaGlobo,
} from "@/lib/globo/capas";
import { PASOS } from "@/lib/globo/pasos";
import { mercado } from "@/lib/supabase/servidor";

// Lecturas del módulo Globo. Las cifras se piden como texto (::text) para no pasar por float.

const COLUMNAS_OBS = "serie_id, valor::text, cambio::text, cambio_pct::text, fecha_dato, hora_dato, recogido_en, url_dato, estado";
const COLUMNAS_EVENTO = "id, tipo, id_externo, titulo, lat::text, lon::text, magnitud::text, fecha_evento, url, datos, recogido_en";
const COLUMNAS_NOTICIA = "id, titular, url, medio, fecha, categoria, lat::text, lon::text, pais";
export const TAREAS_GLOBO = ["sismos-usgs", "ciclones-nhc", "buques-ais"] as const;

function exigir<T>(r: { data: unknown; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`No se pudo leer ${que}: ${r.error.message}`);
  return (r.data ?? []) as T;
}

type Db = Awaited<ReturnType<typeof mercado>>;

async function eventosNoticiasTareas(db: Db, ahora: Date) {
  const desde48 = new Date(ahora.getTime() - 48 * 3_600_000).toISOString();
  const [noticias, eventos, tareas] = await Promise.all([
    db
      .from("noticias")
      .select(COLUMNAS_NOTICIA)
      .gte("fecha", desde48)
      .not("lat", "is", null)
      .not("lon", "is", null)
      .order("fecha", { ascending: false })
      .limit(300),
    db.from("eventos_geo").select(COLUMNAS_EVENTO).order("fecha_evento", { ascending: false }).limit(500),
    db.from("estado_tareas").select("tarea, estado, inicio, ultima_ok, error, detalle").in("tarea", [...TAREAS_GLOBO]),
  ]);
  return {
    noticias: exigir<NoticiaGlobo[]>(noticias, "las noticias"),
    eventos: exigir<EventoGlobo[]>(eventos, "los sismos y ciclones"),
    tareas: exigir<TareaGlobo[]>(tareas, "el estado de las tareas del globo"),
  };
}

/** Todo lo que necesita /globo. */
export async function datosGlobo(ahora = new Date()): Promise<EntradaCapas> {
  const db = await mercado();
  const [series, fuentes, resto] = await Promise.all([
    db
      .from("series")
      .select("id, nombre, nombre_corto, categoria, unidad, fuente_id, max_antiguedad_min, orden, meta, activa")
      .eq("activa", true)
      .order("orden"),
    db.from("fuentes").select("id, nombre, url"),
    eventosNoticiasTareas(db, ahora),
  ]);
  const lasSeries = exigir<(SerieGlobo & { activa: boolean })[]>(series, "las series");

  // Series que el globo muestra: las que tienen coordenadas, las de RD y las de los pasos.
  const deInteres = new Set<string>(["USDDOP_VENTA", "TPM_BCRD", ...PASOS.flatMap((p) => p.series)]);
  for (const s of lasSeries) {
    if (s.fuente_id !== "aisstream" && s.meta && s.meta.lat != null && s.meta.lon != null) deInteres.add(s.id);
  }
  const existentes = new Set(lasSeries.map((s) => s.id));
  const ids = [...deInteres].filter((id) => existentes.has(id));

  // La última observación de cada serie (una consulta por serie: las intradía tienen muchas filas por día).
  // Las AIS van juntas: a lo sumo una por hora y por serie.
  const desdeAis = new Date(ahora.getTime() - 6 * 3_600_000).toISOString();
  const [ultimas, ais] = await Promise.all([
    Promise.all(
      ids.map((id) =>
        db
          .from("observaciones")
          .select(COLUMNAS_OBS)
          .eq("serie_id", id)
          .order("fecha_dato", { ascending: false })
          .order("hora_dato", { ascending: false, nullsFirst: false })
          .limit(1),
      ),
    ),
    db
      .from("observaciones")
      .select(COLUMNAS_OBS)
      .eq("fuente_id", "aisstream")
      .gte("recogido_en", desdeAis)
      .order("hora_dato", { ascending: false })
      .limit(500),
  ]);
  const filas: ObservacionGlobo[] = [];
  ultimas.forEach((r, i) => filas.push(...exigir<ObservacionGlobo[]>(r, `la serie ${ids[i]}`)));
  const vistasAis = new Set<string>();
  for (const o of exigir<ObservacionGlobo[]>(ais, "los conteos AIS")) {
    if (vistasAis.has(o.serie_id)) continue;
    vistasAis.add(o.serie_id);
    filas.push(o);
  }

  return {
    ahora,
    series: lasSeries,
    ultimas: filas,
    fuentes: exigir<FuenteGlobo[]>(fuentes, "las fuentes"),
    ...resto,
  };
}

/** Versión liviana para el panel de la terminal: sin series ni observaciones. */
export async function datosResumenGlobo(ahora = new Date()): Promise<EntradaCapas> {
  const db = await mercado();
  return { ahora, series: [], ultimas: [], fuentes: [], ...(await eventosNoticiasTareas(db, ahora)) };
}
