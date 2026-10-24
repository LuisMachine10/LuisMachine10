import "server-only";
import type { DatosCaja } from "@/lib/caja/tipos";
import { personal } from "@/lib/supabase/servidor";
import { COLUMNAS_REGISTRO, conSaldosVigentes, filaARegistro, type ItemRegistro } from "./registro";

// Lectura del registro único (personal.activos) para el Presupuesto: sus filas vigentes con el saldo de
// hoy. RLS: solo Mena. Lanza con el motivo si la base no responde.
export async function leerRegistro(caja: DatosCaja | null, enlaces: Record<string, string>, hoy: string): Promise<ItemRegistro[]> {
  const db = await personal();
  const r = await db.from("activos").select(COLUMNAS_REGISTRO).is("unido_a", null).order("orden").order("id");
  if (r.error) throw new Error(`No se pudo leer tu Portafolio: ${r.error.message}`);
  const porRegistro = new Map(Object.entries(enlaces).map(([caja, reg]) => [reg, caja]));
  const items = ((r.data ?? []) as unknown as Record<string, unknown>[]).map((f) => filaARegistro(f, porRegistro.get(String(f.id)) ?? null));
  return conSaldosVigentes(items, caja, hoy);
}
