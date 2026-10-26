"use server";

// Acciones del Boletín:
//   · enviarPrueba: pide a la base (mercado.boletin_pedir_prueba) que la Edge Function arme y envíe una
//     edición de prueba, solo al dueño. La app no tiene la clave de Resend: el envío lo hace el servidor.
//   · guardarAjustesBoletin: qué ediciones salen y si llevan «Tu dinero» (personal.preferencias, «boletin»).

import { revalidatePath } from "next/cache";
import { esTipo, normalizarPrefBoletin } from "@/lib/boletin/preferencias";
import { horaRD } from "@/lib/formato";
import { mercado, personal } from "@/lib/supabase/servidor";
import { refrescarFotoTuDinero } from "@/lib/datos-boletin";

export interface EstadoAccion {
  ok: boolean | null;
  mensaje: string | null;
  vez?: number;
}

export async function enviarPrueba(_previo: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const tipo = String(form.get("tipo") ?? "");
  if (!esTipo(tipo)) return { ok: false, mensaje: "Elige qué edición quieres probar.", vez: Date.now() };
  try {
    // La prueba usa la foto más reciente de tu Portafolio.
    if (tipo === "am" || tipo === "finde") await refrescarFotoTuDinero(0);
    const db = await mercado();
    const { data, error } = await db.rpc("boletin_pedir_prueba", { p_tipo: tipo });
    if (error) return { ok: false, mensaje: `No se pudo pedir la prueba: ${error.message}`, vez: Date.now() };
    const r = (data ?? {}) as { ok?: boolean; motivo?: string; disponible_en?: string };
    if (r.ok) {
      revalidatePath("/boletin");
      return { ok: true, mensaje: "Listo: la prueba llega a tu correo en uno o dos minutos y aparece en la lista marcada «Prueba».", vez: Date.now() };
    }
    if (r.motivo === "espera" && r.disponible_en)
      return { ok: false, mensaje: `Ya pediste una prueba hace poco. Puedes pedir otra a las ${horaRD(r.disponible_en)} (hora RD).`, vez: Date.now() };
    if (r.motivo === "sin_configurar") return { ok: false, mensaje: "Las tareas automáticas todavía no están activadas (faltan los secretos en Vault).", vez: Date.now() };
    return { ok: false, mensaje: "No se pudo pedir la prueba.", vez: Date.now() };
  } catch (e) {
    return { ok: false, mensaje: `No se pudo pedir la prueba (${(e as Error).message}).`, vez: Date.now() };
  }
}

export async function guardarAjustesBoletin(_previo: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const valor = normalizarPrefBoletin({
    am: form.get("am") === "on",
    cierre: form.get("cierre") === "on",
    finde: form.get("finde") === "on",
    tasas: form.get("tasas") === "on",
    tu_dinero: form.get("tu_dinero") === "on",
  });
  try {
    const db = await personal();
    const { error } = await db.rpc("guardar_preferencia", { p_clave: "boletin", p_valor: valor });
    if (error) return { ok: false, mensaje: `No se pudo guardar (${error.message}). Vuelve a intentarlo.`, vez: Date.now() };
  } catch (e) {
    return { ok: false, mensaje: `No se pudo guardar (${(e as Error).message}). Vuelve a iniciar sesión e inténtalo otra vez.`, vez: Date.now() };
  }
  revalidatePath("/ajustes");
  revalidatePath("/boletin");
  return { ok: true, mensaje: "Guardado. Las próximas ediciones ya lo toman en cuenta.", vez: Date.now() };
}
