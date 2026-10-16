"use server";

// Pedido manual de «Las 5 del día» y «Guerras»: llama mercado.pedir_resumen_ia(), que verifica que sea Mena,
// limita a una vez cada 15 minutos e invoca la tarea ia-resumen.

import { revalidatePath } from "next/cache";
import { horaRD } from "@/lib/formato";
import { mercado } from "@/lib/supabase/servidor";

export interface EstadoPedido {
  ok: boolean | null;
  mensaje: string | null;
}

export async function pedirResumenIA(_previo: EstadoPedido): Promise<EstadoPedido> {
  const db = await mercado();
  const { data, error } = await db.rpc("pedir_resumen_ia");
  if (error) return { ok: false, mensaje: `No se pudo pedir el resumen: ${error.message}` };
  const r = (data ?? {}) as { ok?: boolean; motivo?: string; disponible_en?: string };
  if (r.ok) {
    revalidatePath("/");
    return { ok: true, mensaje: "Pedido enviado. El resumen tarda uno o dos minutos; la pantalla se actualiza sola." };
  }
  if (r.motivo === "espera" && r.disponible_en) {
    return { ok: false, mensaje: `Ya se pidió hace poco. Se puede volver a pedir a las ${horaRD(r.disponible_en)} (hora RD).` };
  }
  if (r.motivo === "sin_configurar") return { ok: false, mensaje: "Las tareas no están configuradas en Vault (ver README)." };
  return { ok: false, mensaje: "No se pudo pedir el resumen." };
}
