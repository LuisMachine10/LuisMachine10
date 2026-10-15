import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { configServidor } from "@/lib/config";

/** Cliente con la sesión de Mena (RLS aplica). Uno nuevo por petición. */
export async function clienteServidor() {
  const { supabaseUrl, supabaseClave } = configServidor();
  const almacen = await cookies();
  return createServerClient(supabaseUrl, supabaseClave, {
    cookies: {
      getAll: () => almacen.getAll(),
      setAll(porGuardar) {
        try {
          for (const { name, value, options } of porGuardar) almacen.set(name, value, options);
        } catch {
          // Desde un Server Component no se pueden escribir cookies; el proxy ya refrescó la sesión.
        }
      },
    },
  });
}

export async function mercado() {
  return (await clienteServidor()).schema("mercado");
}

/** Esquema personal (Mena Capital y Calendario de Caja). RLS aplica igual. */
export async function personal() {
  return (await clienteServidor()).schema("personal");
}
