// Umbrales editables (umbral, activa y nota), agrupados en una tarjeta por activo, y estado del canal de correo.

import "@/estilos/alertas-ia.css";
import { PanelError } from "@/componentes/PanelError";
import { NOMBRE_TIPO } from "@/lib/alertas-ia";
import { estadoCorreo, type ReglaAlerta, reglasAlerta } from "@/lib/datos-alertas-ia";
import { fechaHoraRD, hace } from "@/lib/formato";
import { Ayuda } from "./Ayuda";
import { FormularioRegla } from "./FormularioRegla";

function agrupar(reglas: ReglaAlerta[]): Array<{ serie: string; nombre: string; reglas: ReglaAlerta[] }> {
  const grupos = new Map<string, { serie: string; nombre: string; reglas: ReglaAlerta[] }>();
  for (const r of reglas) {
    const g = grupos.get(r.serie_id) ?? { serie: r.serie_id, nombre: r.series?.nombre ?? r.serie_id, reglas: [] };
    g.reglas.push(r);
    grupos.set(r.serie_id, g);
  }
  return [...grupos.values()];
}

export async function ReglasAlerta() {
  const ahora = new Date();
  let reglas: ReglaAlerta[];
  let correo: Awaited<ReturnType<typeof estadoCorreo>>;
  try {
    [reglas, correo] = await Promise.all([reglasAlerta(), estadoCorreo()]);
  } catch (e) {
    return <PanelError titulo="Umbrales de alerta" mensaje={(e as Error).message} />;
  }
  const sinCorreo = correo?.error && /RESEND_API_KEY|ALERTAS_EMAIL_DESTINO/.test(correo.error);
  const grupos = agrupar(reglas);
  const activas = reglas.filter((r) => r.activa).length;

  return (
    <section className="panel panel-ancho" aria-labelledby="t-umbrales">
      <div className="panel-cabecera aj-cabecera">
        <h2 className="panel-titulo" id="t-umbrales">
          Tus alertas
        </h2>
        <span className="etiqueta neutra">
          {activas} de {reglas.length} encendidas
        </span>
        <Ayuda titulo="¿Qué es un umbral?">
          Es el número que tú eliges para que Strategya te avise. Por ejemplo: «avísame si el dólar pasa de RD$ 63.50». Strategya revisa cada
          5 minutos con datos confirmados del día y te avisa una sola vez por activo y por día.
        </Ayuda>
        <p className="aj-subtitulo">
          Enciende o apaga cada alerta con el interruptor. Si cambias un número, toca «Guardar cambios».
          {correo ? (
            <span className="tenue" title={fechaHoraRD(correo.inicio)}>
              {" "}
              Última revisión {hace(correo.inicio, ahora)}.
            </span>
          ) : null}
        </p>
      </div>
      <div className="panel-cuerpo">
        {!correo ? (
          <p className="aviso-ia">
            <strong>El vigilante de alertas todavía no ha corrido.</strong> Cuando corra por primera vez, empezará a revisar tus umbrales.
          </p>
        ) : sinCorreo ? (
          <div className="aviso-ia">
            <p>
              <strong>Por ahora las alertas solo se ven en pantalla.</strong> Aparecen arriba de la terminal; el aviso por correo aún no está
              configurado.
            </p>
            <details className="aj-detalle">
              <summary className="chico">¿Cómo activo el correo?</summary>
              <p className="chico tenue">
                Agrega RESEND_API_KEY y ALERTAS_EMAIL_DESTINO en los secretos de Supabase. Motivo exacto: {correo.error}.
              </p>
            </details>
          </div>
        ) : correo.estado === "error" ? (
          <p className="aviso-ia error" role="status">
            <strong>La última revisión falló.</strong> {correo.error ?? "sin detalle"}. Se vuelve a intentar en 5 minutos.
          </p>
        ) : null}

        {grupos.length === 0 ? (
          <div className="aj-vacio">
            <p className="aj-vacio-titulo">Todavía no hay alertas configuradas</p>
            <p className="tenue">Las alertas te avisan cuando un precio o una tasa cruza el número que tú elijas.</p>
          </div>
        ) : (
          <div className="rejilla-reglas">
            {grupos.map((g) => (
              <article key={g.serie} className="tarjeta-activo" aria-labelledby={`activo-${g.serie}`}>
                <h3 className="tarjeta-activo-nombre" id={`activo-${g.serie}`}>
                  {g.nombre}
                </h3>
                <div className="tarjeta-activo-reglas">
                  {g.reglas.map((r) => (
                    <FormularioRegla
                      key={r.id}
                      r={{
                        id: r.id,
                        tipo: r.tipo,
                        umbral: r.umbral,
                        activa: r.activa,
                        nota: r.nota,
                        serie: r.series?.nombre ?? r.serie_id,
                        tipoTexto: NOMBRE_TIPO[r.tipo],
                        unidad: r.series?.unidad ?? "",
                      }}
                    />
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
        <p className="chico tenue aj-pie-nota">Las alertas informan; no son recomendaciones de inversión.</p>
      </div>
    </section>
  );
}
