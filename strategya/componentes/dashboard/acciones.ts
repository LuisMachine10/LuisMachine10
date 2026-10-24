"use server";

// Guardar la disposición del Dashboard y los filtros de «Mis noticias». Todo se normaliza antes de
// escribir (ids desconocidos fuera, tamaños válidos) y se guarda con la sesión de Mena (RLS).

import { revalidatePath } from "next/cache";
import { normalizar, porDefecto } from "@/lib/dashboard/disposicion";
import { normalizarPref, partirPalabras } from "@/lib/dashboard/noticias";
import { type FichaWidget, WIDGETS, WIDGETS_PORTAFOLIO } from "@/lib/dashboard/widgets";
import { personal } from "@/lib/supabase/servidor";

export interface Resultado {
  ok: boolean;
  mensaje: string;
}

/** Tableros con widgets: el Dashboard y el Resumen del Portafolio (cada uno con su preferencia). */
export type ClaveTablero = "dashboard" | "portafolio";
const CATALOGO: Record<ClaveTablero, readonly FichaWidget[]> = { dashboard: WIDGETS, portafolio: WIDGETS_PORTAFOLIO };
const RUTA: Record<ClaveTablero, string> = { dashboard: "/", portafolio: "/capital" };

async function guardar(clave: "dashboard" | "noticias" | "portafolio", valor: unknown): Promise<Resultado> {
  try {
    const db = await personal();
    const { error } = await db.rpc("guardar_preferencia", { p_clave: clave, p_valor: valor });
    if (error) return { ok: false, mensaje: `No se pudo guardar (${error.message}). Revisa tu conexión y vuelve a pulsar el botón.` };
  } catch (e) {
    return { ok: false, mensaje: `No se pudo guardar (${(e as Error).message}). Vuelve a iniciar sesión e inténtalo otra vez.` };
  }
  revalidatePath(clave === "portafolio" ? "/capital" : "/");
  return { ok: true, mensaje: "Guardado." };
}

export async function guardarDisposicion(valor: unknown, clave: ClaveTablero = "dashboard"): Promise<Resultado> {
  const k = clave === "portafolio" ? "portafolio" : "dashboard";
  const r = await guardar(k, normalizar(valor, CATALOGO[k]));
  if (r.ok) revalidatePath(RUTA[k]);
  return r.ok ? { ok: true, mensaje: k === "portafolio" ? "Tu resumen quedó guardado." : "Tu dashboard quedó guardado." } : r;
}

export async function restablecerDisposicion(clave: ClaveTablero = "dashboard"): Promise<Resultado> {
  const k = clave === "portafolio" ? "portafolio" : "dashboard";
  const r = await guardar(k, porDefecto(CATALOGO[k]));
  return r.ok ? { ok: true, mensaje: k === "portafolio" ? "Volviste al resumen de fábrica." : "Volviste al dashboard de fábrica." } : r;
}

export interface EstadoNoticias {
  ok: boolean;
  mensaje: string | null;
  vez: number;
}

/** Formulario de «Mis noticias»: casillas de medios y temas, y palabras separadas por comas. */
export async function guardarMisNoticias(_previo: EstadoNoticias, form: FormData): Promise<EstadoNoticias> {
  const pref = normalizarPref({
    medios: form.getAll("medio").map(String),
    categorias: form.getAll("categoria").map(String),
    palabras: partirPalabras(String(form.get("palabras") ?? "")),
  });
  const r = await guardar("noticias", pref);
  return { ok: r.ok, mensaje: r.ok ? "Listo: tus noticias quedaron guardadas." : r.mensaje, vez: Date.now() };
}
