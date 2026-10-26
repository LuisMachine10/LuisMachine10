import "server-only";
import type { EstadoTarea } from "@/componentes/CurvaTesoro";
import type { ComunicadoInstitucion, EventoAgenda, Movimiento, Noticia, OperacionSec } from "@/lib/noticias";
import { ETIQUETAS, leerMercadoCacheado } from "@/lib/supabase/cache-mercado";

// Lecturas del módulo de noticias. Las cifras y coordenadas se piden como texto (::text).
// Todo es dato de mercado (igual para todos): pasa por la caché compartida (1–5 minutos).

function exigir<T>(r: { data: T | null; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`No se pudo leer ${que}: ${r.error.message}`);
  return r.data as T;
}

export interface EstadoTareaNombrada extends EstadoTarea {
  tarea: string;
  detalle: Record<string, unknown> | null;
}

function estados(prefijo: string): Promise<EstadoTareaNombrada[]> {
  return leerMercadoCacheado(`estados:${prefijo}`, 60, async (db) => {
    const r = await db.from("estado_tareas").select("tarea, estado, inicio, ultima_ok, error, detalle").like("tarea", `${prefijo}%`);
    return exigir(r, "el estado de las tareas") as EstadoTareaNombrada[];
  });
}

const COLUMNAS_NOTICIA = "id, titular, url, medio, fecha, categoria, pais, lat::text, lon::text, lugar, fuente_id";

export async function leerNoticias(horas = 48, limite = 400) {
  const [noticias, tareas] = await Promise.all([
    leerMercadoCacheado(`noticias:${horas}:${limite}`, 120, async (db) => {
      const desde = new Date(Date.now() - horas * 3_600_000).toISOString();
      const r = await db.from("noticias").select(COLUMNAS_NOTICIA).gte("fecha", desde).order("fecha", { ascending: false }).limit(limite);
      return exigir(r, "las noticias") as unknown as Noticia[];
    }, [ETIQUETAS.noticias]),
    estados("noticias-"),
  ]);
  return { noticias, tareas };
}

export async function leerInstituciones(limite = 400) {
  const [leido, tareas] = await Promise.all([
    leerMercadoCacheado(`instituciones:${limite}`, 300, async (db) => {
      const [items, bloqueadas] = await Promise.all([
        db.from("instituciones_feed").select("institucion, titulo, url, fecha, solo_fecha, fuente_id").order("fecha", { ascending: false }).limit(limite),
        db.from("fuentes").select("id").eq("lectura_automatica", false),
      ]);
      return {
        items: exigir(items, "los comunicados") as ComunicadoInstitucion[],
        bloqueadas: (exigir(bloqueadas, "las fuentes") as { id: string }[]).map((f) => f.id),
      };
    }, [ETIQUETAS.noticias]),
    estados("instituciones-"),
  ]);
  return { items: leido.items, bloqueadas: new Set(leido.bloqueadas), tareas };
}

export async function leerOperacionesSec(dias = 10) {
  const [operaciones, tareas] = await Promise.all([
    leerMercadoCacheado(`sec:${dias}`, 300, async (db) => {
      const desde = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date(Date.now() - dias * 86_400_000));
      const r = await db.from("operaciones_sec").select("form, tipo, empresa, cik, fecha, url, indice_fecha, recogido_en").gte("fecha", desde).order("fecha", { ascending: false }).limit(300);
      return exigir(r, "las operaciones de la SEC") as OperacionSec[];
    }, [ETIQUETAS.noticias]),
    estados("sec-edgar"),
  ]);
  return { operaciones, tarea: tareas[0] ?? null };
}

export async function leerAgenda(diasAdelante = 120) {
  return leerMercadoCacheado(`agenda:${diasAdelante}`, 300, async (db) => {
  const desde = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const hasta = new Date(Date.now() + diasAdelante * 86_400_000).toISOString();
  const r = await db
    .from("agenda")
    .select("id, fecha_hora, institucion, evento, importancia, confirmado, url, hora_conocida, zona, nota")
    .gte("fecha_hora", desde)
    .lte("fecha_hora", hasta)
    .order("fecha_hora");
  return exigir(r, "la agenda") as EventoAgenda[];
  }, [ETIQUETAS.noticias]);
}

export async function leerMovimientos() {
  return leerMercadoCacheado("vigilar-movimientos", 60, async (db) => {
  const r = await db
    .from("vigilar_movimientos")
    .select(
      "serie_id, nombre, nombre_corto, categoria, unidad, sustituto_de, max_antiguedad_min, meta, valor::text, cambio::text, cambio_pct::text, fecha_dato, hora_dato, recogido_en, url_dato, estado, fuente_nombre, fuente_url",
    );
  return exigir(r, "los movimientos de las series") as unknown as Movimiento[];
  }, [ETIQUETAS.cotizaciones]);
}
