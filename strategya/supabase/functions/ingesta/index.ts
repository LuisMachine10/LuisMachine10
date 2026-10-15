// Edge Function: curva diaria del Tesoro de EE. UU.
// La llama pg_cron (mercado.invocar_tarea) con el encabezado x-strategya-secreto.

import { createClient } from "@supabase/supabase-js";
import { almacenSupabase } from "../_shared/almacen-supabase.ts";
import { agenteUsuario, Lector } from "../_shared/http.ts";
import { correrTarea } from "../_shared/ingesta.ts";
import { tareaTesoro } from "../_shared/fuentes/tesoro.ts";
import { claveServidor, secretoValido } from "../_shared/seguridad.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Método no permitido", { status: 405 });
  if (!secretoValido(req.headers.get("x-strategya-secreto"), Deno.env.get("STRATEGYA_SECRETO_TAREAS"))) {
    return new Response("No autorizado", { status: 401 });
  }

  const cliente = createClient(Deno.env.get("SUPABASE_URL")!, claveServidor((n) => Deno.env.get(n)), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const lector = new Lector({ agente: agenteUsuario(Deno.env.get("STRATEGYA_CONTACTO")), timeoutMs: 20_000, reintentos: 3 });

  const resumen = await correrTarea(tareaTesoro, almacenSupabase(cliente), { obtener: (url) => lector.obtener(url) });
  return Response.json(resumen, { status: resumen.estado === "error" ? 502 : 200 });
});
