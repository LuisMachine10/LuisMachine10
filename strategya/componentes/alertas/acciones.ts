"use server";

// Edición de una regla de alerta (umbral, activa, nota). La RLS de mercado.reglas_alerta solo deja a Mena
// actualizar esas columnas; aquí además se valida el número con big.js antes de mandarlo.

import { revalidatePath } from "next/cache";
import { NOMBRE_TIPO, type TipoRegla, validarNota, validarUmbral } from "@/lib/alertas-ia";
import { mercado } from "@/lib/supabase/servidor";

export interface EstadoRegla {
  ok: boolean | null;
  mensaje: string | null;
}

export async function guardarRegla(_previo: EstadoRegla, form: FormData): Promise<EstadoRegla> {
  const id = String(form.get("id") ?? "");
  const tipo = String(form.get("tipo") ?? "") as TipoRegla;
  if (!/^\d+$/.test(id) || !(tipo in NOMBRE_TIPO)) return { ok: false, mensaje: "Regla inválida." };

  const umbral = validarUmbral(tipo, String(form.get("umbral") ?? ""));
  if (!umbral.ok) return { ok: false, mensaje: umbral.error };
  const nota = validarNota(String(form.get("nota") ?? ""));
  if (!nota.ok) return { ok: false, mensaje: nota.error };
  const activa = form.get("activa") === "on";

  const cambios: Record<string, unknown> = { activa, nota: nota.valor, actualizado_en: new Date().toISOString() };
  // El umbral viaja como texto: PostgREST lo convierte a numeric sin pasar por float.
  if (tipo !== "cualquier_cambio") cambios.umbral = umbral.valor;

  const db = await mercado();
  const { data, error } = await db.from("reglas_alerta").update(cambios).eq("id", id).select("id");
  if (error) return { ok: false, mensaje: `No se pudo guardar: ${error.message}` };
  if (!data?.length) return { ok: false, mensaje: "No se guardó: la sesión no tiene permiso para editar esta regla." };
  revalidatePath("/ajustes");
  revalidatePath("/");
  return { ok: true, mensaje: "Guardado." };
}
