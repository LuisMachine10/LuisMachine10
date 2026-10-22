"use server";

// Mi lista (personal.watchlist): agregar, quitar y mover símbolos. Escribe con la sesión del dueño
// (personal() exige el correo del dueño; RLS exige mercado.es_autorizado()). Solo símbolos y notas:
// nunca cifras.

import { revalidatePath } from "next/cache";
import { MAXIMO_LISTA, validarSimboloLista } from "@/lib/mercado-vista";
import { personal } from "@/lib/supabase/servidor";

export interface EstadoFormularioLista {
  ok?: string;
  error?: string;
  /** Lo que escribió, para devolverlo al campo si hubo error. */
  simbolo?: string;
  nota?: string;
  /** Cambia en cada envío: el formulario lo usa para limpiar los campos tras un alta. */
  vez?: number;
}

const NOTA_MAX = 140;

function limpiarNota(v: FormDataEntryValue | null): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NOTA_MAX);
}

export async function agregarALista(_previo: EstadoFormularioLista, form: FormData): Promise<EstadoFormularioLista> {
  const escrito = String(form.get("simbolo") ?? "").slice(0, 20);
  const nota = limpiarNota(form.get("nota"));
  const v = validarSimboloLista(escrito);
  if ("error" in v) return { error: v.error, simbolo: escrito, nota, vez: Date.now() };
  try {
    const db = await personal();
    const { data, error } = await db.from("watchlist").select("simbolo, orden").order("orden", { ascending: false });
    if (error) throw new Error(error.message);
    const filas = (data ?? []) as { simbolo: string; orden: number }[];
    if (filas.some((f) => f.simbolo === v.simbolo)) {
      return { error: `${v.simbolo} ya está en tu lista.`, simbolo: escrito, nota, vez: Date.now() };
    }
    if (filas.length >= MAXIMO_LISTA) {
      return { error: `Tu lista ya tiene ${MAXIMO_LISTA} símbolos: quita uno para agregar otro.`, simbolo: escrito, nota, vez: Date.now() };
    }
    const orden = (filas[0]?.orden ?? 0) + 1;
    const r = await db.from("watchlist").insert({ simbolo: v.simbolo, nota, orden });
    if (r.error) throw new Error(r.error.message);
  } catch (e) {
    return { error: `No se pudo guardar: ${(e as Error).message}. Inténtalo de nuevo.`, simbolo: escrito, nota, vez: Date.now() };
  }
  revalidatePath("/mercado");
  return { ok: `${v.simbolo} agregado. Su precio llega en la próxima lectura automática.`, vez: Date.now() };
}

/** Agregar con un toque (ejemplos de la pantalla vacía). */
export async function agregarEjemplo(form: FormData): Promise<void> {
  await agregarALista({}, form);
}

export async function quitarDeLista(form: FormData): Promise<void> {
  const v = validarSimboloLista(form.get("simbolo"));
  if ("error" in v) return;
  const db = await personal();
  const { error } = await db.from("watchlist").delete().eq("simbolo", v.simbolo);
  if (error) throw new Error(`No se pudo quitar ${v.simbolo}: ${error.message}`);
  revalidatePath("/mercado");
}

/** Sube o baja un símbolo un lugar (intercambia su orden con el vecino). */
export async function moverEnLista(form: FormData): Promise<void> {
  const v = validarSimboloLista(form.get("simbolo"));
  const hacia = form.get("hacia") === "arriba" ? -1 : 1;
  if ("error" in v) return;
  const db = await personal();
  const { data, error } = await db.from("watchlist").select("simbolo, orden").order("orden").order("simbolo");
  if (error) throw new Error(`No se pudo leer tu lista: ${error.message}`);
  const filas = (data ?? []) as { simbolo: string; orden: number }[];
  const i = filas.findIndex((f) => f.simbolo === v.simbolo);
  const j = i + hacia;
  if (i < 0 || j < 0 || j >= filas.length) return;
  [filas[i], filas[j]] = [filas[j], filas[i]];
  // Renumera 1..n para que el orden quede limpio aunque hubiera empates.
  const cambios = filas.map((f, k) => ({ simbolo: f.simbolo, orden: k + 1 })).filter((f, k) => filas[k].orden !== f.orden);
  for (const c of cambios) {
    const r = await db.from("watchlist").update({ orden: c.orden }).eq("simbolo", c.simbolo);
    if (r.error) throw new Error(`No se pudo mover ${v.simbolo}: ${r.error.message}`);
  }
  revalidatePath("/mercado");
}
