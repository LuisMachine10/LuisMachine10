import "server-only";
import { personal } from "@/lib/supabase/servidor";

// Lectura de personal.preferencias (RLS: cada usuario ve solo sus filas). Un error se devuelve como
// texto para que la pantalla siga con la disposición por defecto y diga por qué.

export type ClavePreferencia = "dashboard" | "noticias";

export interface LecturaPreferencia {
  valor: unknown;
  actualizadoEn: string | null;
  error: string | null;
}

export async function leerPreferencia(clave: ClavePreferencia): Promise<LecturaPreferencia> {
  try {
    const db = await personal();
    const r = await db.from("preferencias").select("valor, actualizado_en").eq("clave", clave).limit(1);
    if (r.error) return { valor: null, actualizadoEn: null, error: r.error.message };
    const fila = (r.data ?? [])[0] as { valor: unknown; actualizado_en: string } | undefined;
    return { valor: fila?.valor ?? null, actualizadoEn: fila?.actualizado_en ?? null, error: null };
  } catch (e) {
    return { valor: null, actualizadoEn: null, error: (e as Error).message };
  }
}
