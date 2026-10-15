// Implementación de Almacen sobre Supabase (PostgREST, esquema mercado, clave de servidor).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Almacen, ConteoRegistro } from "./ingesta.ts";

export function almacenSupabase(cliente: SupabaseClient): Almacen {
  const db = cliente.schema("mercado");
  return {
    async iniciarCorrida(tarea, fuenteId) {
      const { data, error } = await db.from("corridas").insert({ tarea, fuente_id: fuenteId }).select("id").single();
      if (error) throw new Error(`No se pudo abrir la corrida: ${error.message}`);
      return data.id as number;
    },
    async terminarCorrida(id, cierre) {
      const { error } = await db
        .from("corridas")
        .update({ fin: new Date().toISOString(), estado: cierre.estado, error: cierre.error ?? null, filas: cierre.filas, detalle: cierre.detalle })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    async registrarObservaciones(corridaId, filas) {
      const { data, error } = await db.rpc("registrar_observaciones", { p_corrida_id: corridaId, p_filas: filas });
      if (error) throw new Error(`registrar_observaciones: ${error.message}`);
      const fila = (Array.isArray(data) ? data[0] : data) as ConteoRegistro | undefined;
      return fila ?? { recibidas: 0, insertadas: 0, actualizadas: 0 };
    },
  };
}
