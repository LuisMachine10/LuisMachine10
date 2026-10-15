// Almacén en memoria para probar tareas sin base de datos.
import type { Almacen, CierreCorrida, FilaObservacion } from "../../supabase/functions/_shared/ingesta.ts";

export function almacenMemoria(opciones: { rpc?: (funcion: string, args?: Record<string, unknown>) => unknown } = {}) {
  const observaciones: FilaObservacion[] = [];
  const tablas: Record<string, Record<string, unknown>[]> = {};
  const cierres: CierreCorrida[] = [];
  const llamadasRpc: { funcion: string; args?: Record<string, unknown> }[] = [];
  const almacen: Almacen = {
    iniciarCorrida: async () => 1,
    terminarCorrida: async (_id, c) => void cierres.push(c),
    registrarObservaciones: async (_id, filas) => {
      observaciones.push(...filas);
      return { recibidas: filas.length, insertadas: filas.length, actualizadas: 0 };
    },
    guardar: async (tabla, filas) => {
      (tablas[tabla] ??= []).push(...filas);
      return filas.length;
    },
    rpc: async <T>(funcion: string, args?: Record<string, unknown>) => {
      llamadasRpc.push({ funcion, args });
      return (opciones.rpc?.(funcion, args) ?? null) as T;
    },
  };
  return { almacen, observaciones, tablas, cierres, llamadasRpc };
}
