import "@/estilos/boletin.css";
import type { Metadata } from "next";
import Link from "next/link";
import { EdicionVista } from "@/componentes/boletin/Edicion";
import { Encabezado } from "@/componentes/Encabezado";
import { PanelError } from "@/componentes/PanelError";
import { esTipo, NOMBRE_TIPO } from "@/lib/boletin/preferencias";
import { vistaPrevia } from "@/lib/datos-boletin";
import { fechaHoraRD } from "@/lib/formato";
import type { Edicion } from "@/supabase/functions/_shared/boletin/tipos";

export const metadata: Metadata = { title: "Vista previa del Boletín · Strategya" };
export const dynamic = "force-dynamic";

// «Vista previa ahora»: arma la edición con los datos de este momento (las mismas reglas que el correo) y
// la muestra. No la guarda ni la envía.
export default async function VistaPrevia({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const q = await searchParams;
  const tipo = esTipo(q.tipo) ? q.tipo : "am";
  const ahora = new Date();
  let e: Edicion | null = null;
  let error: string | null = null;
  try {
    e = (await vistaPrevia(tipo, ahora)).edicion;
  } catch (err) {
    error = (err as Error).message;
  }
  return (
    <>
      <Encabezado actual="boletin" ultimaActualizacion={null} />
      <main className="bol-pagina">
        <div className="bol-barra">
          <Link href="/boletin" className="bol-volver">
            ← Volver al Boletín
          </Link>
          <span className="bol-barra-meta">
            <span className="etiqueta alerta">Vista previa · no se envió</span>
            <span>Armada {fechaHoraRD(ahora.toISOString())}</span>
            {e ? <span>{e.palabras} palabras</span> : null}
            <a href={`/boletin/vista-previa/correo?tipo=${tipo}`} target="_blank" rel="noopener noreferrer">
              Ver como correo ↗<span className="sr-solo"> (abre en otra pestaña)</span>
            </a>
          </span>
        </div>
        <p className="bol-aviso">
          Así saldría hoy «{NOMBRE_TIPO[tipo]}» con los datos de este momento. Si la edición no sale hoy (por ejemplo, la de fin de semana un martes), igual se
          arma para que la veas.
        </p>
        {e ? <EdicionVista e={e} /> : <PanelError titulo="Vista previa" mensaje={error ?? "No se pudo armar."} />}
      </main>
    </>
  );
}
