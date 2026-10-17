// Agrupa paneles de la terminal bajo un título de sección sutil. Mantiene la rejilla de dos columnas.
import "@/estilos/mercado.css";

export function Seccion({
  id,
  titulo,
  detalle,
  children,
}: {
  id: string;
  titulo: string;
  /** Texto corto a la derecha del título (fecha, aclaración). */
  detalle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="ter-seccion" aria-labelledby={`sec-${id}`} id={id}>
      <div className="ter-seccion-cab">
        <h2 className="ter-seccion-titulo" id={`sec-${id}`}>
          {titulo}
        </h2>
        {detalle ? <span className="ter-seccion-detalle">{detalle}</span> : null}
      </div>
      {children}
    </section>
  );
}
