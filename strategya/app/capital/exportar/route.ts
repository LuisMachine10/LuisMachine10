// Descarga de los datos de Mena Capital en el mismo formato que se importa (copia de respaldo).
// Lee con la sesión de Mena (RLS); sin sesión autorizada no devuelve nada.

import { exportar } from "@/lib/capital/importar";
import { datosCapital } from "@/lib/datos-capital";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const d = await datosCapital();
    const cuerpo = exportar({
      parametros: d.configurado ? d.ctx.p : null,
      activos: d.ctx.activos,
      transacciones: d.ctx.tx,
      cierres: d.ctx.cierres,
      ips: d.ips,
    });
    return new Response(cuerpo, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="mena-capital-${d.ctx.hoy}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(`No se pudieron leer los datos: ${(e as Error).message}`, { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
