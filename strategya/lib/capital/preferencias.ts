import "server-only";
import { personal } from "@/lib/supabase/servidor";

// Preferencias del Portafolio en personal.preferencias (RLS: cada usuario, solo sus filas). Sin cifras:
//   «portafolio» → disposición de los widgets del Resumen (mismo formato que la del Dashboard);
//   «registro»   → «Unir cuentas repetidas»: los pares que Mena dijo que son distintos y si ya revisó.
//   «aportes»    → aportes del plan que Mena omitió («Omitir este mes»): instrumento, mes y motivo (sin cifras).

export type ClaveCapital = "portafolio" | "registro" | "aportes";

export interface PrefRegistro {
  /** Pares «idPresupuesto|idPortafolio» que Mena dijo que NO son la misma cuenta. */
  separadas: string[];
  /** Mena ya revisó la pantalla (no se vuelve a mostrar sola). */
  revisado: boolean;
}

export async function leerPreferenciaCapital(clave: ClaveCapital): Promise<{ valor: unknown; error: string | null }> {
  try {
    const db = await personal();
    const r = await db.from("preferencias").select("valor").eq("clave", clave).limit(1);
    if (r.error) return { valor: null, error: r.error.message };
    return { valor: ((r.data ?? [])[0] as { valor: unknown } | undefined)?.valor ?? null, error: null };
  } catch (e) {
    return { valor: null, error: (e as Error).message };
  }
}

export function leerPrefRegistro(v: unknown): PrefRegistro {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const separadas = Array.isArray(o.separadas) ? o.separadas.filter((x): x is string => typeof x === "string" && x.length <= 200).slice(0, 500) : [];
  return { separadas, revisado: o.revisado === true };
}

export async function guardarPreferenciaCapital(clave: ClaveCapital, valor: unknown): Promise<string | null> {
  try {
    const db = await personal();
    const { error } = await db.rpc("guardar_preferencia", { p_clave: clave, p_valor: valor });
    return error ? error.message : null;
  } catch (e) {
    return (e as Error).message;
  }
}
