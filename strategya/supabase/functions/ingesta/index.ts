// Edge Function única de ingesta. La llama pg_cron (mercado.invocar_tarea) con el encabezado
// x-strategya-secreto y el cuerpo {"tarea": "<nombre>"}. Cada tarea vive en _shared/fuentes/.

import { createClient } from "@supabase/supabase-js";
import { almacenSupabase } from "../_shared/almacen-supabase.ts";
import { agenteUsuario, Lector, pedirApi } from "../_shared/http.ts";
import { correrTarea } from "../_shared/ingesta.ts";
import { claveServidor, secretoValido } from "../_shared/seguridad.ts";
import { buscarTarea, TAREAS } from "../_shared/tareas.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Método no permitido", { status: 405 });
  if (!secretoValido(req.headers.get("x-strategya-secreto"), Deno.env.get("STRATEGYA_SECRETO_TAREAS"))) {
    return new Response("No autorizado", { status: 401 });
  }

  let cuerpo: { tarea?: unknown } = {};
  try {
    cuerpo = await req.json();
  } catch {
    // cuerpo vacío o inválido: se reporta abajo como tarea desconocida
  }
  const tarea = buscarTarea(cuerpo.tarea);
  if (!tarea) {
    return Response.json({ error: "Tarea desconocida", disponibles: Object.keys(TAREAS) }, { status: 400 });
  }

  const cliente = createClient(Deno.env.get("SUPABASE_URL")!, claveServidor((n) => Deno.env.get(n)), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const agente = agenteUsuario();
  const contacto = Deno.env.get("STRATEGYA_CONTACTO");
  const lector = new Lector({
    agente,
    timeoutMs: 20_000,
    reintentos: 3,
    // La SEC exige un correo de contacto en el User-Agent; ningún otro sitio lo recibe.
    agentePara: (host) => (host.endsWith("sec.gov") && contacto ? agenteUsuario(contacto) : undefined),
  });

  const resumen = await correrTarea(tarea, almacenSupabase(cliente), {
    obtener: (url) => lector.obtener(url),
    api: (url, opciones) => pedirApi(url, { agente, timeoutMs: 30_000, reintentos: 2 }, opciones),
    entorno: (nombre) => Deno.env.get(nombre),
  });
  return Response.json(resumen, { status: resumen.estado === "error" ? 502 : 200 });
});
