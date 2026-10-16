import "server-only";
import type { EstadoTarea } from "@/componentes/CurvaTesoro";
import type { ComunicadoInstitucion, EventoAgenda, Movimiento, Noticia, OperacionSec } from "@/lib/noticias";
import { mercado } from "@/lib/supabase/servidor";

// Lecturas del módulo de noticias. Las cifras y coordenadas se piden como texto (::text).

function exigir<T>(r: { data: T | null; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`No se pudo leer ${que}: ${r.error.message}`);
  return r.data as T;
}

export interface EstadoTareaNombrada extends EstadoTarea {
  tarea: string;
  detalle: Record<string, unknown> | null;
}

async function estados(prefijo: string): Promise<EstadoTareaNombrada[]> {
  const db = await mercado();
  const r = await db.from("estado_tareas").select("tarea, estado, inicio, ultima_ok, error, detalle").like("tarea", `${prefijo}%`);
  return exigir(r, "el estado de las tareas") as EstadoTareaNombrada[];
}

const COLUMNAS_NOTICIA = "id, titular, url, medio, fecha, categoria, pais, lat::text, lon::text, lugar, fuente_id";

export async function leerNoticias(horas = 48, limite = 400) {
  const db = await mercado();
  const desde = new Date(Date.now() - horas * 3_600_000).toISOString();
  const [noticias, tareas] = await Promise.all([
    db.from("noticias").select(COLUMNAS_NOTICIA).gte("fecha", desde).order("fecha", { ascending: false }).limit(limite),
    estados("noticias-"),
  ]);
  return { noticias: exigir(noticias, "las noticias") as unknown as Noticia[], tareas };
}

export async function leerInstituciones(limite = 400) {
  const db = await mercado();
  const [items, bloqueadas, tareas] = await Promise.all([
    db.from("instituciones_feed").select("institucion, titulo, url, fecha, solo_fecha, fuente_id").order("fecha", { ascending: false }).limit(limite),
    db.from("fuentes").select("id").eq("lectura_automatica", false),
    estados("instituciones-"),
  ]);
  return {
    items: exigir(items, "los comunicados") as ComunicadoInstitucion[],
    bloqueadas: new Set((exigir(bloqueadas, "las fuentes") as { id: string }[]).map((f) => f.id)),
    tareas,
  };
}

export async function leerOperacionesSec(dias = 10) {
  const db = await mercado();
  const desde = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date(Date.now() - dias * 86_400_000));
  const [ops, tareas] = await Promise.all([
    db.from("operaciones_sec").select("form, tipo, empresa, cik, fecha, url, indice_fecha, recogido_en").gte("fecha", desde).order("fecha", { ascending: false }).limit(300),
    estados("sec-edgar"),
  ]);
  return { operaciones: exigir(ops, "las operaciones de la SEC") as OperacionSec[], tarea: tareas[0] ?? null };
}

export async function leerAgenda(diasAdelante = 120) {
  const db = await mercado();
  const desde = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const hasta = new Date(Date.now() + diasAdelante * 86_400_000).toISOString();
  const r = await db
    .from("agenda")
    .select("id, fecha_hora, institucion, evento, importancia, confirmado, url, hora_conocida, zona, nota")
    .gte("fecha_hora", desde)
    .lte("fecha_hora", hasta)
    .order("fecha_hora");
  return exigir(r, "la agenda") as EventoAgenda[];
}

export async function leerMovimientos() {
  const db = await mercado();
  const r = await db
    .from("vigilar_movimientos")
    .select(
      "serie_id, nombre, nombre_corto, categoria, unidad, sustituto_de, max_antiguedad_min, meta, valor::text, cambio::text, cambio_pct::text, fecha_dato, hora_dato, recogido_en, url_dato, estado, fuente_nombre, fuente_url",
    );
  return exigir(r, "los movimientos de las series") as unknown as Movimiento[];
}
