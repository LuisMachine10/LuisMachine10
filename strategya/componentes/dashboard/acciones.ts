"use server";

// Guardar la disposición del Dashboard y los filtros de «Mis noticias». Todo se normaliza antes de
// escribir (ids desconocidos fuera, tamaños válidos) y se guarda con la sesión de Mena (RLS).

import { revalidatePath } from "next/cache";
import { normalizar, porDefecto } from "@/lib/dashboard/disposicion";
import { normalizarPref, partirPalabras } from "@/lib/dashboard/noticias";
import { personal } from "@/lib/supabase/servidor";

export interface Resultado {
  ok: boolean;
  mensaje: string;
}

async function guardar(clave: "dashboard" | "noticias", valor: unknown): Promise<Resultado> {
  try {
    const db = await personal();
    const { error } = await db.rpc("guardar_preferencia", { p_clave: clave, p_valor: valor });
    if (error) return { ok: false, mensaje: `No se pudo guardar (${error.message}). Revisa tu conexión y vuelve a pulsar el botón.` };
  } catch (e) {
    return { ok: false, mensaje: `No se pudo guardar (${(e as Error).message}). Vuelve a iniciar sesión e inténtalo otra vez.` };
  }
  revalidatePath("/");
  return { ok: true, mensaje: "Guardado." };
}

export async function guardarDisposicion(valor: unknown): Promise<Resultado> {
  const r = await guardar("dashboard", normalizar(valor));
  return r.ok ? { ok: true, mensaje: "Tu dashboard quedó guardado." } : r;
}

export async function restablecerDisposicion(): Promise<Resultado> {
  const r = await guardar("dashboard", porDefecto());
  return r.ok ? { ok: true, mensaje: "Volviste al dashboard de fábrica." } : r;
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
