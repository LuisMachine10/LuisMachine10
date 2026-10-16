// Antes de cada página: refresca la sesión de Supabase y deja pasar solo al dueño.
// RLS en la base es la barrera real; esto evita mostrar pantallas vacías a quien no es Mena.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { configServidor } from "@/lib/config";

const PUBLICAS = ["/login"];

export async function proxy(request: NextRequest) {
  const { supabaseUrl, supabaseClave, emailDueno } = configServidor();
  let respuesta = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseClave, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(porGuardar, encabezados) {
        for (const { name, value } of porGuardar) request.cookies.set(name, value);
        respuesta = NextResponse.next({ request });
        for (const { name, value, options } of porGuardar) respuesta.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(encabezados)) respuesta.headers.set(k, v);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email.toLowerCase() : null;
  const ruta = request.nextUrl.pathname;
  const publica = PUBLICAS.some((p) => ruta === p || ruta.startsWith(`${p}/`));

  if (!email && !publica) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    destino.search = "";
    return NextResponse.redirect(destino);
  }
  if (email && email !== emailDueno) {
    await supabase.auth.signOut();
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    destino.search = "?error=no_autorizado";
    const r = NextResponse.redirect(destino);
    for (const c of respuesta.cookies.getAll()) r.cookies.set(c);
    return r;
  }
  if (email && publica) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/";
    destino.search = "";
    return NextResponse.redirect(destino);
  }
  return respuesta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icono.svg|cesium/).*)"],
};
