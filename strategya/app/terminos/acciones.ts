"use server";

// Términos y privacidad: «Acepto los términos y condiciones» (una vez por versión). Se guarda la versión y la fecha en
// personal.preferencias (clave «terminos», RLS: solo su dueño) y una cookie con la versión para no consultar la base en
// cada página (lib/terminos.ts).

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { personal } from "@/lib/supabase/servidor";
import { aceptoVigente, COOKIE_TERMINOS, leerAceptacion, rutaVolver, VERSION_TERMINOS } from "@/lib/terminos";

async function ponerCookie() {
  (await cookies()).set(COOKIE_TERMINOS, VERSION_TERMINOS, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 400 });
}

export async function aceptarTerminos(form: FormData): Promise<void> {
  const volver = rutaVolver(String(form.get("volver") ?? "/"));
  if (form.get("acepto") !== "si") redirect(`/terminos?error=marca&volver=${encodeURIComponent(volver)}`);
  const db = await personal();
  const { error } = await db.rpc("guardar_preferencia", { p_clave: "terminos", p_valor: { version: VERSION_TERMINOS, aceptadoEn: new Date().toISOString() } });
  if (error) redirect(`/terminos?error=guardar&volver=${encodeURIComponent(volver)}`);
  await ponerCookie();
  redirect(volver);
}

/** Ya los aceptó (en otro equipo, por ejemplo): solo se pone la cookie y sigue. */
export async function continuarTerminos(form: FormData): Promise<void> {
  const volver = rutaVolver(String(form.get("volver") ?? "/"));
  const db = await personal();
  const r = await db.from("preferencias").select("valor").eq("clave", "terminos").limit(1);
  const a = leerAceptacion(((r.data ?? [])[0] as { valor: unknown } | undefined)?.valor);
  if (!aceptoVigente(a)) redirect(`/terminos?volver=${encodeURIComponent(volver)}`);
  await ponerCookie();
  redirect(volver);
}
