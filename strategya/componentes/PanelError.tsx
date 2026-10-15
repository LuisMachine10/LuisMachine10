// Cuando la base no responde, la pantalla lo dice con el motivo en lugar de mostrar cifras vacías.

export function PanelError({ titulo, mensaje }: { titulo: string; mensaje: string }) {
  const esquemaNoExpuesto = /schema must be one of|Invalid schema/i.test(mensaje);
  return (
    <section className="panel panel-ancho" role="alert">
      <div className="panel-cabecera">
        <h2 className="panel-titulo">{titulo}</h2>
        <span className="etiqueta error">✕ sin conexión a los datos</span>
      </div>
      <div className="vacio">
        <p className="baja chico">{mensaje}</p>
        {esquemaNoExpuesto ? (
          <p className="chico">
            Falta exponer el esquema <span className="mono">mercado</span> en Supabase → Project Settings → Data API →
            Exposed schemas (README, paso 2.1.2).
          </p>
        ) : null}
      </div>
    </section>
  );
}
