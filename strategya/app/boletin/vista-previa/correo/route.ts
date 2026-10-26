// HTML de correo de la vista previa (los datos de este momento; no se guarda ni se envía).
import { CABECERAS_CORREO } from "@/lib/boletin/cabeceras";
import { esTipo } from "@/lib/boletin/preferencias";
import { vistaPrevia } from "@/lib/datos-boletin";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const tipo = new URL(req.url).searchParams.get("tipo");
  try {
    const { html } = await vistaPrevia(esTipo(tipo) ? tipo : "am");
    return new Response(html, { headers: CABECERAS_CORREO });
  } catch (err) {
    return new Response(`No se pudo armar la vista previa: ${(err as Error).message}`, { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
