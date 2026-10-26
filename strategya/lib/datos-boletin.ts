import "server-only";
import { datosCapital } from "@/lib/datos-capital";
import { fotoTuDinero } from "@/lib/boletin/foto";
import { mercado } from "@/lib/supabase/servidor";
import { armarEdicion } from "@/supabase/functions/_shared/boletin/armar";
import { htmlCorreo } from "@/supabase/functions/_shared/boletin/render";
import type { DatosBoletin, Edicion, TipoEdicion } from "@/supabase/functions/_shared/boletin/tipos";

// Lecturas del Boletín (con la sesión de Mena: RLS aplica; una edición con «Tu dinero» solo la ve su dueño).

export type EstadoEdicion = "armando" | "lista" | "enviada" | "sin_envio" | "error";

export interface FilaEdicion {
  id: number;
  tipo: TipoEdicion;
  fecha: string;
  prueba: boolean;
  asunto: string | null;
  estado: EstadoEdicion;
  error: string | null;
  palabras: number | null;
  con_tu_dinero: boolean;
  creado_en: string;
  enviado_en: string | null;
}

export interface EdicionCompleta extends FilaEdicion {
  contenido: unknown;
  texto: string | null;
  html: string | null;
}

const COLUMNAS = "id, tipo, fecha, prueba, asunto, estado, error, palabras, con_tu_dinero, creado_en, enviado_en";

export async function listarEdiciones(tipo: TipoEdicion | null, limite = 60): Promise<FilaEdicion[]> {
  const db = await mercado();
  let q = db.from("boletin_ediciones").select(COLUMNAS).order("fecha", { ascending: false }).order("creado_en", { ascending: false }).limit(limite);
  if (tipo) q = q.eq("tipo", tipo);
  const { data, error } = await q;
  if (error) throw new Error(`No se pudieron leer las ediciones: ${error.message}`);
  return (data ?? []) as FilaEdicion[];
}

export async function leerEdicion(id: number): Promise<EdicionCompleta | null> {
  const db = await mercado();
  const { data, error } = await db.from("boletin_ediciones").select(`${COLUMNAS}, contenido, texto, html`).eq("id", id).maybeSingle();
  if (error) throw new Error(`No se pudo leer la edición: ${error.message}`);
  return (data as EdicionCompleta | null) ?? null;
}

/** La última edición real (no prueba) que ya se armó, con su contenido. */
export async function ultimaEdicion(): Promise<EdicionCompleta | null> {
  const db = await mercado();
  const { data, error } = await db
    .from("boletin_ediciones")
    .select(`${COLUMNAS}, contenido, texto, html`)
    .eq("prueba", false)
    .in("estado", ["enviada", "sin_envio", "error", "lista"])
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false })
    .limit(1);
  if (error) throw new Error(`No se pudo leer el último boletín: ${error.message}`);
  return ((data ?? [])[0] as EdicionCompleta | undefined) ?? null;
}

/** ¿Es una Edicion armada por _shared/boletin? (contenido guardado en la base). */
export function esEdicion(x: unknown): x is Edicion {
  return !!x && typeof x === "object" && Array.isArray((x as Edicion).secciones) && Array.isArray((x as Edicion).resumen) && typeof (x as Edicion).nombre === "string";
}

/**
 * Recalcula la foto de «Tu dinero» con el motor del Portafolio y la guarda (para que las ediciones de la
 * mañana la usen). Si la última tiene menos de `minimoMin` minutos, no hace nada. Nunca lanza.
 */
export async function refrescarFotoTuDinero(minimoMin = 20): Promise<{ ok: boolean; motivo?: string }> {
  try {
    const db = await mercado();
    if (minimoMin > 0) {
      const { data } = await db.from("boletin_tu_dinero").select("calculado_en").limit(1);
      const ultima = (data ?? [])[0] as { calculado_en: string } | undefined;
      if (ultima && Date.now() - new Date(ultima.calculado_en).getTime() < minimoMin * 60_000) return { ok: true, motivo: "reciente" };
    }
    const foto = fotoTuDinero(await datosCapital());
    const { error } = await db.rpc("boletin_guardar_tu_dinero", { p_datos: foto });
    return error ? { ok: false, motivo: error.message } : { ok: true };
  } catch (e) {
    return { ok: false, motivo: (e as Error).message };
  }
}

/** Vista previa: arma la edición con los datos de este momento, sin guardarla ni enviarla. */
export async function vistaPrevia(tipo: TipoEdicion, ahora = new Date()): Promise<{ edicion: Edicion; html: string }> {
  if (tipo === "am" || tipo === "finde") await refrescarFotoTuDinero(0);
  const db = await mercado();
  const { data, error } = await db.rpc("boletin_datos", { p_tipo: tipo, p_ahora: ahora.toISOString() });
  if (error) throw new Error(`No se pudieron leer los datos del boletín: ${error.message}`);
  const datos = data as DatosBoletin;
  const edicion = armarEdicion(datos, { urlApp: null });
  return { edicion, html: htmlCorreo(edicion) };
}
