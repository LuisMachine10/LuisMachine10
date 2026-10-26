// El HTML exacto que se envió por correo (o se habría enviado), para verlo tal cual en el navegador.
// Lee con la sesión de Mena (RLS: una edición con «Tu dinero» solo la ve su dueño).

import { leerEdicion } from "@/lib/datos-boletin";
import { CABECERAS_CORREO } from "@/lib/boletin/cabeceras";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) return new Response("No encontrada", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  try {
    const e = await leerEdicion(Number(id));
    if (!e?.html) return new Response("Esta edición no tiene correo guardado.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    return new Response(e.html, { headers: CABECERAS_CORREO });
  } catch (err) {
    return new Response(`No se pudo leer la edición: ${(err as Error).message}`, { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
