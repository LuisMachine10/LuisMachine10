import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
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

/**
 * Toda lectura o escritura de datos pasa por aquí: la sesión debe ser la del dueño. No basta con el
 * proxy (una server action se puede llamar directo) ni con RLS (un update o delete bloqueado por RLS
 * no da error: afecta 0 filas y la acción diría «guardado»). Una vez por petición.
 */
export const exigirDueno = cache(async (): Promise<void> => {
  const { data } = await (await clienteServidor()).auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email.toLowerCase() : null;
  if (!email || email !== configServidor().emailDueno) throw new Error("Sesión no autorizada: vuelve a iniciar sesión.");
});

export async function mercado() {
  await exigirDueno();
  return (await clienteServidor()).schema("mercado");
}

/** Esquema personal (Mena Capital y Calendario de Caja). RLS aplica igual. */
export async function personal() {
  await exigirDueno();
  return (await clienteServidor()).schema("personal");
}
