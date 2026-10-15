import "server-only";
import type { EstadoTarea } from "@/componentes/CurvaTesoro";
import type { ObservacionCurva, SerieCurva } from "@/lib/curva";
import { mercado } from "@/lib/supabase/servidor";

// Las cifras se piden como texto (::text) para no pasar por float en el JSON de PostgREST.
const COLUMNAS_OBS = "serie_id, valor::text, cambio::text, fecha_dato, recogido_en, url_dato, estado";

export interface Fuente {
  id: string;
  nombre: string;
  url: string;
  tipo: string;
  lectura_automatica: boolean;
  notas_de_uso: string | null;
}

export interface FilaEstadoTarea extends EstadoTarea {
  tarea: string;
  corrida_id: number;
  fuente_id: string | null;
  fin: string | null;
  filas: number;
  errores_24h: number;
  detalle: Record<string, unknown>;
}

function exigir<T>(r: { data: T | null; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`No se pudo leer ${que}: ${r.error.message}`);
  return r.data as T;
}

export async function datosTesoro(diasAtras = 45) {
  const db = await mercado();
  const desde = new Date(Date.now() - diasAtras * 86_400_000).toISOString().slice(0, 10);
  const [series, obs, fuente, tarea] = await Promise.all([
    db.from("series").select("id, nombre, nombre_corto, orden, max_antiguedad_min").eq("fuente_id", "tesoro_eeuu").order("orden"),
    db.from("observaciones").select(COLUMNAS_OBS).eq("fuente_id", "tesoro_eeuu").gte("fecha_dato", desde).order("fecha_dato"),
    db.from("fuentes").select("nombre, url").eq("id", "tesoro_eeuu").maybeSingle(),
    db.from("estado_tareas").select("estado, inicio, ultima_ok, error").eq("tarea", "ingesta-tesoro").maybeSingle(),
  ]);
  return {
    series: exigir(series, "las series") as SerieCurva[],
    observaciones: exigir(obs, "las observaciones") as unknown as ObservacionCurva[],
    fuente: (exigir(fuente, "la fuente") as { nombre: string; url: string } | null) ?? {
      nombre: "Tesoro de EE. UU.",
      url: "https://home.treasury.gov/",
    },
    tarea: exigir(tarea, "el estado de la tarea") as EstadoTarea | null,
  };
}

export async function estadoTareas() {
  const db = await mercado();
  const [tareas, corridas, fuentes] = await Promise.all([
    db.from("estado_tareas").select("*").order("tarea"),
    db.from("corridas").select("id, tarea, inicio, fin, estado, error, filas").order("inicio", { ascending: false }).limit(25),
    db.from("fuentes").select("id, nombre, url, tipo, lectura_automatica, notas_de_uso").order("id"),
  ]);
  return {
    tareas: exigir(tareas, "las tareas") as FilaEstadoTarea[],
    corridas: exigir(corridas, "las corridas") as Array<{
      id: number;
      tarea: string;
      inicio: string;
      fin: string | null;
      estado: string;
      error: string | null;
      filas: number;
    }>,
    fuentes: exigir(fuentes, "las fuentes") as Fuente[],
  };
}
