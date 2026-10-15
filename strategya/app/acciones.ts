"use server";

import { redirect } from "next/navigation";
import { configServidor } from "@/lib/config";
import { clienteServidor } from "@/lib/supabase/servidor";

export interface EstadoLogin {
  error: string | null;
}

export async function iniciarSesion(_previo: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const clave = String(form.get("clave") ?? "");
  if (!email || !clave) return { error: "Escribe tu correo y tu contraseña." };

  // Solo el dueño puede entrar; a cualquier otro se le responde igual que a una clave errada.
  if (email !== configServidor().emailDueno) return { error: "Correo o contraseña incorrectos." };

  const supabase = await clienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password: clave });
  if (error) return { error: "Correo o contraseña incorrectos." };
  redirect("/");
}

export async function cerrarSesion(): Promise<void> {
  const supabase = await clienteServidor();
  await supabase.auth.signOut();
  redirect("/login");
}
