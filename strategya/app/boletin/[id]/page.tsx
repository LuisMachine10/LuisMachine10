import "@/estilos/boletin.css";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EdicionVista, EtiquetaEstado } from "@/componentes/boletin/Edicion";
import { Encabezado } from "@/componentes/Encabezado";
import { PanelError } from "@/componentes/PanelError";
import { esEdicion, type EdicionCompleta, leerEdicion } from "@/lib/datos-boletin";
import { fechaHoraRD } from "@/lib/formato";

export const metadata: Metadata = { title: "Edición del Boletín · Strategya" };
export const dynamic = "force-dynamic";

export default async function PaginaEdicion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) notFound();
  let e: EdicionCompleta | null;
  try {
    e = await leerEdicion(Number(id));
  } catch (err) {
    return (
      <>
        <Encabezado actual="boletin" ultimaActualizacion={null} />
        <main className="bol-pagina">
          <PanelError titulo="Edición del Boletín" mensaje={(err as Error).message} />
        </main>
      </>
    );
  }
  if (!e) notFound();

  return (
    <>
      <Encabezado actual="boletin" ultimaActualizacion={null} />
      <main className="bol-pagina">
        <div className="bol-barra">
          <Link href="/boletin" className="bol-volver">
            ← Todas las ediciones
          </Link>
          <span className="bol-barra-meta">
            {e.prueba ? <span className="etiqueta neutra">Prueba</span> : null}
            <EtiquetaEstado estado={e.estado} />
            <span>{e.enviado_en ? `Enviada ${fechaHoraRD(e.enviado_en)}` : `Armada ${fechaHoraRD(e.creado_en)}`}</span>
            {e.palabras ? <span>{e.palabras} palabras</span> : null}
            {e.html ? (
              <a href={`/boletin/${e.id}/correo`} target="_blank" rel="noopener noreferrer">
                Ver como correo ↗<span className="sr-solo"> (abre en otra pestaña)</span>
              </a>
            ) : null}
          </span>
        </div>
        {e.error ? (
          <p className="bol-aviso" role="status">
            {e.estado === "error" ? "No se pudo enviar: " : ""}
            {e.error}
          </p>
        ) : null}
        {esEdicion(e.contenido) ? (
          <EdicionVista e={e.contenido} />
        ) : e.texto ? (
          <article className="bol-edicion">
            <pre className="bol-texto-plano">{e.texto}</pre>
          </article>
        ) : (
          <p className="bol-aviso">Esta edición se reservó pero no llegó a armarse{e.error ? "" : " todavía"}.</p>
        )}
      </main>
    </>
  );
}
