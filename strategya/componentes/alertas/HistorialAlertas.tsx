// Historial de alertas disparadas (todas las fechas) como línea de tiempo por día: dato, umbral cruzado,
// fuente y si salió el correo.

import "@/estilos/alertas-ia.css";
import Link from "next/link";
import { PanelError } from "@/componentes/PanelError";
import { type AlertaDisparada, historialAlertas } from "@/lib/datos-alertas-ia";
import { fechaCorta, fechaHoraRD, horaRD } from "@/lib/formato";
import { IconoCampana, valorConUnidad } from "./BannerAlertas";

function porDia(filas: AlertaDisparada[]): Array<{ fecha: string; alertas: AlertaDisparada[] }> {
  const dias: Array<{ fecha: string; alertas: AlertaDisparada[] }> = [];
  for (const a of filas) {
    const ultimo = dias.at(-1);
    if (ultimo && ultimo.fecha === a.fecha) ultimo.alertas.push(a);
    else dias.push({ fecha: a.fecha, alertas: [a] });
  }
  return dias;
}

export async function HistorialAlertas({ limite = 60 }: { limite?: number }) {
  let filas: AlertaDisparada[];
  try {
    filas = await historialAlertas(limite);
  } catch (e) {
    return <PanelError titulo="Historial de alertas" mensaje={(e as Error).message} />;
  }
  return (
    <section className="panel" aria-labelledby="t-historial-alertas">
      <div className="panel-cabecera aj-cabecera">
        <h2 className="panel-titulo" id="t-historial-alertas">
          Alertas que ya sonaron
        </h2>
        <span className="sello" title="Una alerta por activo y día · hora de República Dominicana">
          Últimas {limite} · hora RD
        </span>
      </div>
      {filas.length === 0 ? (
        <div className="panel-cuerpo">
          <div className="aj-vacio">
            <span className="aj-vacio-icono">
              <IconoCampana tam={22} />
            </span>
            <p className="aj-vacio-titulo">Todavía no ha sonado ninguna alerta</p>
            <p className="tenue">
              Cuando un activo cruce uno de tus umbrales, aparecerá aquí con la hora, el dato y de dónde salió. Se revisa cada 5 minutos.
            </p>
            <Link href="#t-umbrales" className="boton secundario">
              Revisar mis umbrales
            </Link>
          </div>
        </div>
      ) : (
        <div className="panel-cuerpo">
          <ol className="linea-tiempo">
            {porDia(filas).map((d) => (
              <li key={d.fecha} className="lt-dia">
                <h3 className="lt-fecha">{fechaCorta(d.fecha, true)}</h3>
                <ol className="lt-lista">
                  {d.alertas.map((a) => {
                    const url = a.observaciones?.url_dato ?? a.observaciones?.fuentes?.url ?? null;
                    const fuente = a.observaciones?.fuentes?.nombre ?? "fuente sin registrar";
                    return (
                      <li key={a.id} className="lt-item">
                        <span className="lt-punto" aria-hidden="true" />
                        <div className="lt-arriba">
                          <time className="mono tenue chico" dateTime={a.disparada_en} title={fechaHoraRD(a.disparada_en)}>
                            {horaRD(a.disparada_en)}
                          </time>
                          <strong>{a.series?.nombre_corto ?? a.serie_id}</strong>
                          <span className="mono">{valorConUnidad(a.valor, a.series?.unidad)}</span>
                        </div>
                        <p className="lt-mensaje">{a.mensaje}</p>
                        <div className="sello">
                          {url ? (
                            <a href={url} target="_blank" rel="noopener noreferrer">
                              {fuente} <span aria-hidden="true">↗</span>
                            </a>
                          ) : (
                            <span>{fuente}</span>
                          )}
                          {a.observaciones ? <span>dato del {fechaCorta(a.observaciones.fecha_dato)}</span> : null}
                          {a.enviada_en ? (
                            <span className="sube" title={fechaHoraRD(a.enviada_en)}>
                              ✓ correo {horaRD(a.enviada_en)}
                            </span>
                          ) : (
                            <span>solo en pantalla</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
