import "server-only";
import Big from "big.js";
import {
  type Conflicto,
  conflictos,
  type CorridaIA,
  estadoIA,
  type EstadoIA,
  hoyRD,
  inicioMesRD,
  type ItemCinco,
  itemsCinco,
  type TipoRegla,
  type TitularGuardado,
} from "@/lib/alertas-ia";
import { mercado } from "@/lib/supabase/servidor";

// Lecturas de Supabase del módulo Alertas + IA. Las cifras se piden como texto (::text).

function exigir<T>(r: { data: unknown; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`No se pudo leer ${que}: ${r.error.message}`);
  return r.data as T;
}

// ───────────────────────────── Alertas ─────────────────────────────

export interface AlertaDisparada {
  id: number;
  serie_id: string;
  fecha: string;
  valor: string;
  mensaje: string;
  disparada_en: string;
  enviada_en: string | null;
  canal: string | null;
  series: { nombre: string; nombre_corto: string; unidad: string; max_antiguedad_min: number } | null;
  observaciones: {
    fecha_dato: string;
    hora_dato: string | null;
    recogido_en: string;
    url_dato: string | null;
    fuentes: { nombre: string; url: string } | null;
  } | null;
}

const COLUMNAS_ALERTA =
  "id, serie_id, fecha, valor::text, mensaje, disparada_en, enviada_en, canal, " +
  "series(nombre, nombre_corto, unidad, max_antiguedad_min), " +
  "observaciones(fecha_dato, hora_dato, recogido_en, url_dato, fuentes(nombre, url))";

export async function alertasDeHoy(ahora: Date): Promise<AlertaDisparada[]> {
  const db = await mercado();
  const r = await db.from("alertas_disparadas").select(COLUMNAS_ALERTA).eq("fecha", hoyRD(ahora)).order("disparada_en", { ascending: false });
  return exigir<AlertaDisparada[]>(r, "las alertas de hoy");
}

export async function historialAlertas(limite = 60): Promise<AlertaDisparada[]> {
  const db = await mercado();
  const r = await db.from("alertas_disparadas").select(COLUMNAS_ALERTA).order("disparada_en", { ascending: false }).limit(limite);
  return exigir<AlertaDisparada[]>(r, "el historial de alertas");
}

export interface ReglaAlerta {
  id: number;
  serie_id: string;
  tipo: TipoRegla;
  umbral: string | null;
  activa: boolean;
  nota: string | null;
  actualizado_en: string;
  series: { nombre: string; unidad: string; orden: number } | null;
}

export async function reglasAlerta(): Promise<ReglaAlerta[]> {
  const db = await mercado();
  const r = await db.from("reglas_alerta").select("id, serie_id, tipo, umbral::text, activa, nota, actualizado_en, series(nombre, unidad, orden)").order("id");
  const reglas = exigir<ReglaAlerta[]>(r, "las reglas de alerta");
  return [...reglas].sort((a, b) => (a.series?.orden ?? 0) - (b.series?.orden ?? 0) || a.id - b.id);
}

/** Última corrida de la tarea alertas: dice si el correo está activo (falta RESEND_API_KEY o no). */
export async function estadoCorreo(): Promise<{ estado: string; error: string | null; inicio: string } | null> {
  const db = await mercado();
  const r = await db.from("corridas").select("estado, error, inicio").eq("tarea", "alertas").order("inicio", { ascending: false }).limit(1).maybeSingle();
  return exigir(r, "el estado del correo de alertas");
}

// ───────────────────────────── IA ─────────────────────────────

async function corridasIA(): Promise<CorridaIA[]> {
  const db = await mercado();
  const r = await db
    .from("corridas")
    .select("tarea, inicio, estado, error, detalle")
    .in("tarea", ["ia-porque", "ia-resumen"])
    .order("inicio", { ascending: false })
    .limit(10);
  return exigir<CorridaIA[]>(r, "las corridas de la IA");
}

export interface GastoIA {
  gasto: string;
  estado: EstadoIA;
  porTipo: Array<{ tipo: string; llamadas: number; costo: string }>;
  desde: string;
}

/** Gasto de IA del mes (mes de RD), exacto, y si la IA está activa o en el tope. */
export async function gastoIA(ahora: Date): Promise<GastoIA> {
  const db = await mercado();
  const desde = inicioMesRD(ahora);
  const [gasto, filas, corridas] = await Promise.all([
    db.rpc("gasto_ia_mes", { p_ahora: ahora.toISOString() }),
    db.from("explicaciones").select("tipo, costo_usd::text, modelo").gte("fecha", desde).limit(5000),
    corridasIA(),
  ]);
  const total = exigir<string | null>(gasto, "el gasto de IA") ?? "0";
  const lista = exigir<Array<{ tipo: string; costo_usd: string; modelo: string }>>(filas, "las explicaciones del mes");
  // Suma por tipo con big.js (en el componente se vuelve a formatear desde texto).
  const mapa = new Map<string, { llamadas: number; costo: Big }>();
  for (const f of lista) {
    if (f.modelo === "sin-llamada") continue;
    const m = mapa.get(f.tipo) ?? { llamadas: 0, costo: new Big(0) };
    m.llamadas++;
    m.costo = m.costo.plus(f.costo_usd);
    mapa.set(f.tipo, m);
  }
  return {
    gasto: String(total),
    estado: estadoIA(corridas),
    porTipo: [...mapa.entries()].map(([tipo, m]) => ({ tipo, llamadas: m.llamadas, costo: m.costo.toFixed() })),
    desde,
  };
}

export interface Resumen<T> {
  fecha: string;
  modelo: string;
  lista: T[];
}

async function ultimoResumen(tipo: "cinco_del_dia" | "guerras", ahora: Date) {
  const db = await mercado();
  const desde = new Date(ahora.getTime() - 24 * 3_600_000).toISOString();
  const r = await db
    .from("explicaciones")
    .select("fecha, modelo, datos")
    .eq("tipo", tipo)
    .eq("confirmada", true)
    .gte("fecha", desde)
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();
  return exigir<{ fecha: string; modelo: string; datos: unknown } | null>(r, `el resumen ${tipo}`);
}

export async function cincoDelDia(ahora: Date): Promise<Resumen<ItemCinco> | null> {
  const f = await ultimoResumen("cinco_del_dia", ahora);
  if (!f) return null;
  const lista = itemsCinco(f.datos);
  return lista.length ? { fecha: f.fecha, modelo: f.modelo, lista } : null;
}

export async function guerras(ahora: Date): Promise<Resumen<Conflicto> | null> {
  const f = await ultimoResumen("guerras", ahora);
  if (!f) return null;
  return { fecha: f.fecha, modelo: f.modelo, lista: conflictos(f.datos) };
}

/** Titulares guardados más recientes (respaldo sin IA). Solo titular, medio, fecha, país y enlace. */
export async function titularesRecientes(categorias: string[], ahora: Date, limite = 20): Promise<TitularGuardado[]> {
  const db = await mercado();
  const desde = new Date(ahora.getTime() - 48 * 3_600_000).toISOString();
  const r = await db
    .from("noticias")
    .select("id, titular, url, medio, fecha, pais, categoria")
    .in("categoria", categorias)
    .gte("fecha", desde)
    .order("fecha", { ascending: false })
    .limit(limite);
  return exigir<TitularGuardado[]>(r, "los titulares");
}

export interface Porque {
  serie_id: string;
  fecha: string;
  texto: string;
  fuentes: Array<{ titulo: string; url: string }>;
  confirmada: boolean;
  modelo: string;
}

/** El porqué más reciente (últimas 24 h) de cada serie pedida. */
export async function porques(serieIds: string[], ahora: Date): Promise<Map<string, Porque>> {
  const salida = new Map<string, Porque>();
  if (!serieIds.length) return salida;
  const db = await mercado();
  const desde = new Date(ahora.getTime() - 24 * 3_600_000).toISOString();
  const r = await db
    .from("explicaciones")
    .select("serie_id, fecha, texto, fuentes, confirmada, modelo")
    .eq("tipo", "porque")
    .in("serie_id", serieIds)
    .gte("fecha", desde)
    .order("fecha", { ascending: false })
    .limit(200);
  for (const p of exigir<Porque[]>(r, "los porqués")) if (!salida.has(p.serie_id)) salida.set(p.serie_id, p);
  return salida;
}
