// Cuando la base no responde, la pantalla lo dice con el motivo en lugar de mostrar cifras vacías.
import "@/estilos/mercado.css";

export function PanelError({ titulo, mensaje }: { titulo: string; mensaje: string }) {
  const esquemaNoExpuesto = /schema must be one of|Invalid schema/i.test(mensaje);
  return (
    <section className="panel panel-ancho panel-error" role="alert">
      <div className="panel-cabecera">
        <h2 className="panel-titulo">{titulo}</h2>
        <span className="etiqueta error">Sin conexión a los datos</span>
      </div>
      <div className="panel-error-cuerpo">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 9v4M12 17h.01M10.3 3.9L2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        </svg>
        <div>
          <p className="panel-error-mensaje">{mensaje}</p>
          {esquemaNoExpuesto ? (
            <p className="chico tenue">
              Falta exponer el esquema <span className="mono">mercado</span> en Supabase → Project Settings → Data API →
              Exposed schemas (README, paso 2.1.2).
            </p>
          ) : (
            <p className="chico tenue">Las demás secciones siguen funcionando. Se vuelve a intentar en la próxima actualización.</p>
          )}
        </div>
      </div>
    </section>
  );
}
