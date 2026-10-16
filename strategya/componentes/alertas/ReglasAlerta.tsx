// Umbrales editables (umbral, activa y nota) y estado del canal de correo.

import "@/estilos/alertas-ia.css";
import { PanelError } from "@/componentes/PanelError";
import { NOMBRE_TIPO } from "@/lib/alertas-ia";
import { estadoCorreo, type ReglaAlerta, reglasAlerta } from "@/lib/datos-alertas-ia";
import { fechaHoraRD, hace } from "@/lib/formato";
import { FormularioRegla } from "./FormularioRegla";

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
  return (
    <section className="panel panel-ancho" aria-labelledby="t-umbrales">
      <div className="panel-cabecera">
        <h2 className="panel-titulo" id="t-umbrales">
          Umbrales de alerta
        </h2>
        <span className="sello">
          Se evalúan cada 5 min con datos confirmados del día · una alerta por activo y día
          {correo ? <span title={fechaHoraRD(correo.inicio)}>· última evaluación {hace(correo.inicio, ahora)}</span> : null}
        </span>
      </div>
      <div className="panel-cuerpo">
        {!correo ? (
          <p className="aviso-ia chico">La tarea de alertas todavía no ha corrido.</p>
        ) : sinCorreo ? (
          <p className="aviso-ia chico">
            Correo no activo: {correo.error}. Las alertas se ven solo en pantalla (agrega RESEND_API_KEY y ALERTAS_EMAIL_DESTINO en los
            secretos de Supabase).
          </p>
        ) : correo.estado === "error" ? (
          <p className="aviso-ia chico baja">La última evaluación falló: {correo.error ?? "sin detalle"}.</p>
        ) : null}
        <div className="rejilla-reglas">
          {reglas.map((r) => (
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
        <p className="chico tenue">Las alertas informan; no son recomendaciones de inversión.</p>
      </div>
    </section>
  );
}
