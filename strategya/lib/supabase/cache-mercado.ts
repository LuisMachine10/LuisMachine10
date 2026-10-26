import "server-only";
import { createClient } from "@supabase/supabase-js";
import { revalidateTag, unstable_cache } from "next/cache";
import { configServidor } from "@/lib/config";
import { clienteServidor, exigirDueno } from "@/lib/supabase/servidor";

// Caché compartida de los datos del esquema `mercado` (iguales para todos: cotizaciones, BCRD, noticias…).
//
// Por qué así: Strategya usa el modelo de caché sin Cache Components (cada página es force-dynamic y lee la
// sesión), así que se usa `unstable_cache` con `revalidate` (60–300 s) y etiquetas para invalidar. Lo que
// cambia la ingesta (Edge Function, fuera de Next) se refresca solo al vencer el tiempo; lo que cambia Mena
// desde la app (carga manual, umbrales…) invalida su etiqueta en la server action.
//
// Seguridad: (1) antes de tocar la caché se exige la sesión del dueño (exigirDueno), así que nadie más llega
// a estos datos; (2) dentro de la caché no se leen cookies: la consulta va con el token de esa sesión, que
// NO forma parte de la clave; (3) NUNCA se cachea aquí nada del esquema `personal` (sus lecturas siguen
// siendo por petición). El resultado debe ser JSON (sin Map, Set ni Date).

export const ETIQUETA_MERCADO = "mercado";

/** Etiquetas por tema, para invalidar solo lo que cambió. */
export const ETIQUETAS = {
  cotizaciones: "mercado:cotizaciones",
  rd: "mercado:rd",
  noticias: "mercado:noticias",
  alertas: "mercado:alertas",
  catalogo: "mercado:catalogo",
} as const;

type ClienteMercado = ReturnType<ReturnType<typeof createClient>["schema"]>;

function clienteConToken(token: string): ClienteMercado {
  const { supabaseUrl, supabaseClave } = configServidor();
  return createClient(supabaseUrl, supabaseClave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  }).schema("mercado");
}

async function tokenDeSesion(): Promise<string> {
  const { data } = await (await clienteServidor()).auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sesión no autorizada: vuelve a iniciar sesión.");
  return token;
}

/**
 * Lee datos de `mercado` a través de la caché compartida. `clave` identifica la lectura (incluye sus
 * parámetros); `leer` recibe el cliente del esquema mercado y debe LANZAR si la base responde con error
 * (un error nunca se guarda en la caché).
 */
export async function leerMercadoCacheado<T>(
  clave: string,
  segundos: number,
  leer: (db: ClienteMercado) => Promise<T>,
  etiquetas: readonly string[] = [],
): Promise<T> {
  await exigirDueno();
  const token = await tokenDeSesion();
  return unstable_cache(async () => leer(clienteConToken(token)), ["strategya-mercado", clave], {
    revalidate: segundos,
    tags: [ETIQUETA_MERCADO, ...etiquetas],
  })();
}

/** Para las server actions que cambian datos de `mercado`: la próxima lectura va a la base. */
export function invalidarMercado(etiqueta: string = ETIQUETA_MERCADO): void {
  revalidateTag(etiqueta, { expire: 0 });
}
